// HTTP benchmark: start all targets under targets/, burst-load every API in parallel, print results.
//
// Usage (from benchmark/):
//
//	go run benchmark.go
//
// Environment:
//
//	BENCH_REQUESTS      — requests per target per category (default 500)
//	BENCH_CONCURRENCY   — max in-flight requests per target (default 128)
//	BENCH_WARMUP        — warmup requests per target before measure (default 50)
//	BENCH_TARGETS       — comma filter: ogerjs,honojs,vanillabun,...
//	BENCH_CATEGORIES    — comma filter: ok,json-parse,...,headers (twelve scenarios)
//	BENCH_FAIL_ON_ERROR — 1 to exit non-zero if any errors
//	BENCH_PARALLEL      — 1 to load all targets at once per category (default 0: sequential targets)
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"math"
	"math/rand"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

const benchAuthHeader = "Bearer bench-token"

type category struct {
	Key     string
	Path    string
	Method  string
	Body    string
	Auth    bool
	Headers map[string]string
	Label   string
}

type target struct {
	ID      string
	Label   string
	Port    int
	Command string
	Args    []string
	Dir     string
	Pid     int
}

type stats struct {
	Target      string
	Port        int
	Category    string
	CategoryKey string
	Requests    int
	Errors      int
	ElapsedMs   float64
	RPS         float64
	P50Ms       float64
	P90Ms       float64
	P95Ms       float64
	P99Ms       float64
	P999Ms      float64
	AvgMs       float64
	StdDevMs    float64
	PeakMemMB   float64
}

var categories = map[string]category{
	"ok":             {Key: "ok", Label: "GET / (ping)", Path: "/", Method: "GET"},
	"json-parse":     {Key: "json-parse", Label: "POST /bench/json-parse", Path: "/bench/json-parse", Method: "POST", Body: jsonParseBody()},
	"json-serialize": {Key: "json-serialize", Label: "GET /bench/json-serialize", Path: "/bench/json-serialize", Method: "GET"},
	"route-param":    {Key: "route-param", Label: "GET /bench/item/42", Path: "/bench/item/42", Method: "GET"},
	"auth":           {Key: "auth", Label: "GET /bench/auth", Path: "/bench/auth", Method: "GET", Auth: true},
	"async-io":       {Key: "async-io", Label: "GET /bench/async-io", Path: "/bench/async-io", Method: "GET"},
	"query": {
		Key: "query", Label: "GET /bench/search (query)", Path: "/bench/search?q=acct&limit=50&cursor=abc",
		Method: "GET",
	},
	"nested": {
		Key: "nested", Label: "GET /bench/api/v1/accounts/42/balance", Path: "/bench/api/v1/accounts/42/balance",
		Method: "GET",
	},
	"middleware": {
		Key: "middleware", Label: "GET /bench/middleware (chain)", Path: "/bench/middleware", Method: "GET",
		Headers: map[string]string{"X-Bench-Step": "3"},
	},
	"validation": {
		Key: "validation", Label: "POST /bench/transfer", Path: "/bench/transfer", Method: "POST",
		Body: transferBody(),
	},
	"large-json": {
		Key: "large-json", Label: "POST /bench/large-json", Path: "/bench/large-json", Method: "POST",
		Body: largeJsonBody(),
	},
	"headers": {
		Key: "headers", Label: "GET /bench/headers", Path: "/bench/headers", Method: "GET",
		Headers: map[string]string{
			"X-Request-Id": "bench-req-001",
			"X-Api-Key":    "bench-key",
			"Accept":       "application/json",
		},
	},
}

func main() {
	root := benchRoot()
	requests := envInt("BENCH_REQUESTS", 500)
	concurrency := envInt("BENCH_CONCURRENCY", 128)
	warmup := envInt("BENCH_WARMUP", 50)
	targets := discoverTargets(root)
	catKeys := selectedCategories()

	if len(targets) == 0 {
		fatal("no targets (check benchmark/targets/)")
	}
	if len(catKeys) == 0 {
		fatal("no valid BENCH_CATEGORIES")
	}

	fmt.Println("OgerJS HTTP benchmark")
	parallel := envBool("BENCH_PARALLEL", false)
	parallelLabel := "sequential targets per category"
	if parallel {
		parallelLabel = "all targets in parallel per category"
	}
	fmt.Printf("Go %s | Burst %d req/target/category | Concurrency %d | %s\n\n",
		runtime.Version(), requests, concurrency, parallelLabel)

	procs := make([]*exec.Cmd, 0, len(targets))
	stop := func() {
		for _, p := range procs {
			killProcess(p)
		}
	}
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sig
		stop()
		os.Exit(130)
	}()

	fmt.Println("Starting APIs...")
	for i, t := range targets {
		freePort(t.Port)
		cmd := startTarget(t)
		procs = append(procs, cmd)
		targets[i].Pid = cmd.Process.Pid
	}
	defer stop()

	// ── BACKGROUND RESOURCE MONITORING ──
	peakMemory := make(map[string]int) // target.ID -> Peak RSS (KB)
	var peakMemMu sync.Mutex
	stopMonitoring := make(chan struct{})
	go func() {
		ticker := time.NewTicker(100 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-stopMonitoring:
				return
			case <-ticker.C:
				for _, t := range targets {
					if t.Pid > 0 {
						mem, err := getMemoryUsage(t.Pid)
						if err == nil {
							peakMemMu.Lock()
							if mem > peakMemory[t.ID] {
								peakMemory[t.ID] = mem
							}
							peakMemMu.Unlock()
						}
					}
				}
			}
		}
	}()

	var readyWg sync.WaitGroup
	for _, t := range targets {
		readyWg.Add(1)
		go func(t target) {
			defer readyWg.Done()
			waitReady(t.Port, "/")
		}(t)
	}
	readyWg.Wait()
	for _, t := range targets {
		fmt.Printf("  ready  %s  :%d  (PID %d)\n", t.Label, t.Port, t.Pid)
	}

	if warmup > 0 {
		fmt.Printf("\nWarmup %d requests per target...\n", warmup)
		var wg sync.WaitGroup
		for _, t := range targets {
			wg.Add(1)
			go func(t target) {
				defer wg.Done()
				burstLoad(t.Port, category{Path: "/", Method: "GET", Key: "ok"}, warmup, concurrency, false)
			}(t)
		}
		wg.Wait()
	}

	var all []stats
	fmt.Println("\nBurst benchmark (all targets in parallel per category)...")
	for _, key := range catKeys {
		cat := categories[key]
		fmt.Printf("\n── %s ──\n", cat.Label)

		catResults := make([]stats, 0, len(targets))

		record := func(t target, s burstResult) stats {
			peakMemMu.Lock()
			peakKb := peakMemory[t.ID]
			peakMemMu.Unlock()
			return stats{
				Target:      t.Label,
				Port:        t.Port,
				Category:    cat.Label,
				CategoryKey: key,
				Requests:    s.ok,
				Errors:      s.errs,
				ElapsedMs:   s.elapsedMs,
				RPS:         s.rps,
				P50Ms:       s.p50,
				P90Ms:       s.p90,
				P95Ms:       s.p95,
				P99Ms:       s.p99,
				P999Ms:      s.p999,
				AvgMs:       s.avg,
				StdDevMs:    s.stddev,
				PeakMemMB:   float64(peakKb) / 1024.0,
			}
		}

		if parallel {
			var mu sync.Mutex
			var wg sync.WaitGroup
			for _, t := range targets {
				wg.Add(1)
				go func(t target) {
					defer wg.Done()
					s := burstLoad(t.Port, cat, requests, concurrency, true)
					row := record(t, s)
					mu.Lock()
					catResults = append(catResults, row)
					all = append(all, row)
					mu.Unlock()
					fmt.Printf("  %-14s %6.0f req/s | %4d ok | p50 %5.2f ms | p99 %5.2f ms | err %d\n",
						t.Label, s.rps, s.ok, s.p50, s.p99, s.errs)
				}(t)
			}
			wg.Wait()
		} else {
			for _, t := range targets {
				s := burstLoad(t.Port, cat, requests, concurrency, true)
				row := record(t, s)
				catResults = append(catResults, row)
				all = append(all, row)
				fmt.Printf("  %-14s %6.0f req/s | %4d ok | p50 %5.2f ms | p99 %5.2f ms | err %d\n",
					t.Label, s.rps, s.ok, s.p50, s.p99, s.errs)
			}
		}

		sort.Slice(catResults, func(i, j int) bool { return catResults[i].RPS > catResults[j].RPS })
		if len(catResults) > 0 {
			w := catResults[0]
			fmt.Printf("  → fastest: %s (%.0f req/s)\n", w.Target, w.RPS)
		}
	}

	close(stopMonitoring)

	printMatrix(all, targets, catKeys)

	// Generate beautiful report artifact
	reportPath := filepath.Join(root, "benchmark_report.md")
	generateMarkdownReport(reportPath, all, peakMemory)

	if path := os.Getenv("BENCH_JSON_PATH"); path != "" {
		writeJSON(path, all, requests, concurrency, warmup)
	}
	if envBool("BENCH_FAIL_ON_ERROR", false) {
		for _, s := range all {
			if s.Errors > 0 {
				os.Exit(1)
			}
		}
	}
}

type burstResult struct {
	ok        int
	errs      int
	elapsedMs float64
	rps       float64
	p50       float64
	p90       float64
	p95       float64
	p99       float64
	p999      float64
	avg       float64
	stddev    float64
}

func burstLoad(port int, cat category, total, concurrency int, measure bool) burstResult {
	if concurrency < 1 {
		concurrency = 1
	}
	if total < 1 {
		total = 1
	}

	maxIdle := concurrency
	if maxIdle < 64 {
		maxIdle = 64
	}
	client := &http.Client{
		Timeout: 30 * time.Second,
		Transport: &http.Transport{
			MaxIdleConns:        maxIdle * 2,
			MaxIdleConnsPerHost: maxIdle,
			MaxConnsPerHost:     maxIdle * 2,
			IdleConnTimeout:     90 * time.Second,
			DisableCompression:  true,
		},
	}

	url := fmt.Sprintf("http://127.0.0.1:%d%s", port, cat.Path)
	headers := map[string]string{}
	for k, v := range cat.Headers {
		headers[k] = v
	}
	if cat.Auth {
		headers["Authorization"] = envOr("BENCH_AUTH_HEADER", benchAuthHeader)
	}

	var (
		mu       sync.Mutex
		latency  []float64
		okCount  int
		errCount int
		seen     int
		cap      = 10_000
	)

	start := time.Now()
	sem := make(chan struct{}, concurrency)
	var wg sync.WaitGroup

	for i := 0; i < total; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			reqStart := time.Now()
			req, err := http.NewRequest(cat.Method, url, nil)
			if err != nil {
				if measure {
					mu.Lock()
					errCount++
					mu.Unlock()
				}
				return
			}
			for k, v := range headers {
				req.Header.Set(k, v)
			}
			if cat.Body != "" {
				req.Body = io.NopCloser(strings.NewReader(cat.Body))
				req.ContentLength = int64(len(cat.Body))
				req.Header.Set("Content-Type", "application/json")
			}

			res, err := client.Do(req)
			elapsed := time.Since(reqStart).Seconds() * 1000
			if err != nil {
				if measure {
					mu.Lock()
					errCount++
					mu.Unlock()
				}
				return
			}
			bodyBytes, err := io.ReadAll(res.Body)
			_ = res.Body.Close()
			if err != nil {
				if measure {
					mu.Lock()
					errCount++
					mu.Unlock()
				}
				return
			}

			if !measure {
				return
			}
			mu.Lock()
			defer mu.Unlock()
			if res.StatusCode < 200 || res.StatusCode >= 300 {
				fmt.Fprintf(os.Stderr, "[ERROR] Target on port %d returned bad status: %d\n", port, res.StatusCode)
				errCount++
				return
			}
			
			bodyStr := string(bodyBytes)
			if !validateBody(cat.Key, bodyStr) {
				fmt.Fprintf(os.Stderr, "[ERROR] Target on port %d validation failed for key %q. Got: %q\n", port, cat.Key, bodyStr)
				errCount++
				return
			}

			okCount++
			seen++
			if len(latency) < cap {
				latency = append(latency, elapsed)
				return
			}
			j := rand.Intn(seen)
			if j < cap {
				latency[j] = elapsed
			}
		}()
	}
	wg.Wait()
	elapsedSec := time.Since(start).Seconds()
	if elapsedSec <= 0 {
		elapsedSec = 0.001
	}

	sort.Float64s(latency)
	avg := 0.0
	stddev := 0.0
	if len(latency) > 0 {
		sum := 0.0
		for _, v := range latency {
			sum += v
		}
		avg = sum / float64(len(latency))

		varianceSum := 0.0
		for _, v := range latency {
			diff := v - avg
			varianceSum += diff * diff
		}
		stddev = math.Sqrt(varianceSum / float64(len(latency)))
	}

	rps := 0.0
	if measure {
		rps = float64(okCount) / elapsedSec
	}

	return burstResult{
		ok:        okCount,
		errs:      errCount,
		elapsedMs: elapsedSec * 1000,
		rps:       rps,
		p50:       percentile(latency, 50),
		p90:       percentile(latency, 90),
		p95:       percentile(latency, 95),
		p99:       percentile(latency, 99),
		p999:      percentile(latency, 99.9),
		avg:       avg,
		stddev:    stddev,
	}
}

func discoverTargets(root string) []target {
	defs := []struct {
		id      string
		label   string
		port    int
		runtime string
		entry   string
	}{
		{"vanillabun", "Vanilla Bun", 3001, "bun", "server.ts"},
		{"vanillanode", "Vanilla Node", 3002, "node", "server.js"},
		{"ogerjs", "OgerJS (Bun)", 3003, "bun", "server.ts"},
		{"ogerjsnode", "OgerJS (Node)", 3007, "node", "server.ts"},
		{"honojs", "Hono (Bun)", 3004, "bun", "server.ts"},
		{"honojsnode", "Hono (Node)", 3008, "node", "server.ts"},
		{"elysiajs", "Elysia", 3005, "bun", "server.ts"},
		{"expressjs", "Express", 3006, "node", "server.js"},
	}

	filter := targetFilter()
	out := make([]target, 0, len(defs))
	targetsDir := filepath.Join(root, "targets")

	for _, d := range defs {
		if len(filter) > 0 {
			if _, ok := filter[d.id]; !ok {
				if _, ok := filter[strings.ToLower(d.label)]; !ok {
					if _, ok := filter[strconv.Itoa(d.port)]; !ok {
						continue
					}
				}
			}
		}
		dir := filepath.Join(targetsDir, d.id)
		entry := filepath.Join(dir, d.entry)
		if _, err := os.Stat(entry); err != nil {
			continue
		}
		args := []string{d.entry}
		if d.runtime == "bun" && strings.HasSuffix(d.entry, ".ts") {
			args = []string{"run", d.entry}
		} else if d.runtime == "node" && strings.HasSuffix(d.entry, ".ts") {
			args = []string{"--experimental-strip-types", d.entry}
		}
		out = append(out, target{
			ID:      d.id,
			Label:   d.label,
			Port:    d.port,
			Command: d.runtime,
			Args:    args,
			Dir:     dir,
		})
	}
	return out
}

func startTarget(t target) *exec.Cmd {
	cmd := exec.Command(t.Command, t.Args...)
	cmd.Dir = t.Dir
	cmd.Env = append(os.Environ(), fmt.Sprintf("PORT=%d", t.Port))
	if logPath := os.Getenv("BENCH_TARGET_LOG_DIR"); logPath != "" {
		_ = os.MkdirAll(logPath, 0o755)
		logFile, err := os.Create(filepath.Join(logPath, "target_"+t.ID+".log"))
		if err == nil {
			cmd.Stdout = logFile
			cmd.Stderr = logFile
		} else {
			cmd.Stdout = io.Discard
			cmd.Stderr = io.Discard
		}
	} else {
		cmd.Stdout = io.Discard
		cmd.Stderr = io.Discard
	}
	_ = cmd.Start()
	return cmd
}

func waitReady(port int, path string) {
	url := fmt.Sprintf("http://127.0.0.1:%d%s", port, path)
	deadline := time.Now().Add(20 * time.Second)
	client := &http.Client{Timeout: 2 * time.Second}
	for time.Now().Before(deadline) {
		res, err := client.Get(url)
		if err == nil && res.StatusCode >= 200 && res.StatusCode < 300 {
			_, _ = io.Copy(io.Discard, res.Body)
			_ = res.Body.Close()
			return
		}
		if res != nil {
			_, _ = io.Copy(io.Discard, res.Body)
			_ = res.Body.Close()
		}
		time.Sleep(100 * time.Millisecond)
	}
	fatal(fmt.Sprintf("%s not ready on :%d", url, port))
}

func printMatrix(all []stats, targets []target, catKeys []string) {
	fmt.Println("\n══ Throughput matrix (req/s) ══")
	header := fmt.Sprintf("%-16s", "Target")
	colW := 11
	for _, k := range catKeys {
		if len(k)+1 > colW {
			colW = len(k) + 1
		}
	}
	for _, k := range catKeys {
		header += fmt.Sprintf(" %*s", colW, k)
	}
	fmt.Println(header)
	for _, t := range targets {
		row := fmt.Sprintf("%-16s", t.Label)
		for _, k := range catKeys {
			val := "—"
			for _, s := range all {
				if s.Target == t.Label && s.CategoryKey == k {
					val = fmt.Sprintf("%d", int(s.RPS+0.5))
					break
				}
			}
			row += fmt.Sprintf(" %*s", colW, val)
		}
		fmt.Println(row)
	}
}

func writeJSON(path string, all []stats, requests, concurrency, warmup int) {
	report := map[string]any{
		"generatedAt": time.Now().UTC().Format(time.RFC3339),
		"methodology": map[string]any{
			"mode":        "burst",
			"requests":    requests,
			"concurrency": concurrency,
			"warmup":      warmup,
			"parallel":    envBool("BENCH_PARALLEL", false),
		},
		"results": all,
	}
	f, err := os.Create(path)
	if err != nil {
		fatal(err.Error())
	}
	defer f.Close()
	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")
	_ = enc.Encode(report)
	fmt.Printf("\nWrote %s\n", path)
}

func benchRoot() string {
	if root := os.Getenv("BENCH_ROOT"); root != "" {
		return root
	}
	wd, err := os.Getwd()
	if err != nil {
		fatal(err.Error())
	}
	if filepath.Base(wd) == "benchmark" {
		return wd
	}
	return filepath.Join(wd, "benchmark")
}

func targetFilter() map[string]struct{} {
	raw := strings.TrimSpace(os.Getenv("BENCH_TARGETS"))
	if raw == "" {
		return nil
	}
	m := make(map[string]struct{})
	for _, p := range strings.Split(raw, ",") {
		m[strings.ToLower(strings.TrimSpace(p))] = struct{}{}
	}
	return m
}

func selectedCategories() []string {
	raw := envOr("BENCH_CATEGORIES", "ok,json-parse,json-serialize,route-param,auth,async-io,query,nested,middleware,validation,large-json,headers")
	out := make([]string, 0)
	for _, k := range strings.Split(raw, ",") {
		k = strings.TrimSpace(k)
		if _, ok := categories[k]; ok {
			out = append(out, k)
		}
	}
	return out
}

func jsonParseBody() string {
	return benchJSONBody(32, "json-parse")
}

func transferBody() string {
	payload := map[string]any{
		"fromAccount": "acc-1001",
		"toAccount":   "acc-2002",
		"amountCents": 50000,
		"currency":    "USD",
		"reference":   "bench-transfer-001",
	}
	b, _ := json.Marshal(payload)
	return string(b)
}

func largeJsonBody() string {
	tx := make([]map[string]any, 64)
	for i := range tx {
		tx[i] = map[string]any{
			"id":          fmt.Sprintf("tx-%d", i),
			"accountId":   fmt.Sprintf("acc-%d", (i%8)+1),
			"amountCents": (i + 1) * 100,
			"currency":    "USD",
			"narrative":   fmt.Sprintf("payment-%d", i),
		}
	}
	payload := map[string]any{
		"batchId":      "batch-001",
		"institution":  "bench-bank",
		"transactions": tx,
	}
	b, _ := json.Marshal(payload)
	return string(b)
}

func benchJSONBody(count int, tag string) string {
	items := make([]map[string]any, count)
	for i := range items {
		items[i] = map[string]any{
			"id":   i,
			"name": fmt.Sprintf("item-%d", i),
			"tags": []string{"bench", tag},
		}
	}
	payload := map[string]any{
		"items": items,
		"meta":  map[string]any{"source": "benchmark", "version": 1},
	}
	b, _ := json.Marshal(payload)
	return string(b)
}

func percentile(sorted []float64, p float64) float64 {
	if len(sorted) == 0 {
		return 0
	}
	rank := int(float64(len(sorted))*p/100+0.999999) - 1
	if rank < 0 {
		rank = 0
	}
	if rank >= len(sorted) {
		rank = len(sorted) - 1
	}
	return sorted[rank]
}

func killProcess(cmd *exec.Cmd) {
	if cmd == nil || cmd.Process == nil {
		return
	}
	if runtime.GOOS == "windows" {
		_ = exec.Command("taskkill", "/pid", strconv.Itoa(cmd.Process.Pid), "/T", "/F").Run()
		return
	}
	_ = cmd.Process.Signal(syscall.SIGTERM)
}

func freePort(port int) {
	if runtime.GOOS == "windows" {
		out, err := exec.Command("cmd", "/c", fmt.Sprintf("netstat -ano | findstr :%d", port)).Output()
		if err != nil {
			return
		}
		for _, line := range strings.Split(string(out), "\n") {
			fields := strings.Fields(strings.TrimSpace(line))
			if len(fields) < 5 {
				continue
			}
			pid := fields[len(fields)-1]
			if pid == "0" || pid == strconv.Itoa(os.Getpid()) {
				continue
			}
			_ = exec.Command("taskkill", "/F", "/PID", pid).Run()
		}
		return
	}
	_ = exec.Command("sh", "-c", fmt.Sprintf("lsof -t -i:%d | xargs kill -9 2>/dev/null", port)).Run()
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

func envBool(key string, fallback bool) bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	if v == "" {
		return fallback
	}
	return v == "1" || v == "true" || v == "yes"
}

func fatal(msg string) {
	fmt.Fprintln(os.Stderr, msg)
	os.Exit(1)
}

func getMemoryUsage(pid int) (int, error) {
	if runtime.GOOS == "windows" {
		cmd := exec.Command("tasklist", "/FI", fmt.Sprintf("PID eq %d", pid), "/FO", "CSV")
		out, err := cmd.Output()
		if err != nil {
			return 0, err
		}
		lines := strings.Split(string(out), "\n")
		if len(lines) < 2 {
			return 0, fmt.Errorf("tasklist output too short")
		}
		parts := strings.Split(lines[1], "\",\"")
		if len(parts) < 5 {
			return 0, fmt.Errorf("tasklist output invalid format")
		}
		memStr := strings.Trim(parts[4], "\" \r\nK")
		memStr = strings.ReplaceAll(memStr, ",", "")
		memStr = strings.ReplaceAll(memStr, ".", "")
		memKb, err := strconv.Atoi(memStr)
		if err != nil {
			return 0, err
		}
		return memKb, nil
	} else {
		cmd := exec.Command("ps", "-o", "rss=", "-p", strconv.Itoa(pid))
		out, err := cmd.Output()
		if err != nil {
			return 0, err
		}
		rssStr := strings.TrimSpace(string(out))
		rssKb, err := strconv.Atoi(rssStr)
		if err != nil {
			return 0, err
		}
		return rssKb, nil
	}
}

func validateBody(key, body string) bool {
	switch key {
	case "ok":
		return body == "ok"
	case "json-parse":
		return strings.Contains(body, "itemCount") && strings.Contains(body, "32")
	case "json-serialize":
		return strings.Contains(body, "count") && strings.Contains(body, "24") && strings.Contains(body, "276")
	case "route-param":
		return body == "42"
	case "auth":
		return strings.Contains(body, "authorized") && strings.Contains(body, "true")
	case "async-io":
		return strings.Contains(body, "count") && strings.Contains(body, "24")
	case "query":
		return strings.Contains(body, "q") && strings.Contains(body, "acct") && strings.Contains(body, "50")
	case "nested":
		return strings.Contains(body, "accountId") && strings.Contains(body, "42") && strings.Contains(body, "1250000")
	case "middleware":
		return strings.Contains(body, "ok") && strings.Contains(body, "true")
	case "validation":
		return strings.Contains(body, "accepted") && strings.Contains(body, "50000")
	case "large-json":
		return strings.Contains(body, "batchId") && strings.Contains(body, "processed") && strings.Contains(body, "64")
	case "headers":
		return strings.Contains(body, "requestId") && strings.Contains(body, "bench-req-001") && strings.Contains(body, "apiKeyPresent")
	}
	return true
}

func generateMarkdownReport(path string, all []stats, peakMemory map[string]int) {
	f, err := os.Create(path)
	if err != nil {
		fmt.Printf("Error creating markdown report: %s\n", err)
		return
	}
	defer f.Close()

	fmt.Fprintf(f, "# OgerJS HTTP Performance & Resource Utilization Benchmark Report\n\n")
	fmt.Fprintf(f, "Generated at: %s\n\n", time.Now().UTC().Format(time.RFC850))
	fmt.Fprintf(f, "## Methodology & System Info\n")
	fmt.Fprintf(f, "- **OS**: %s/%s\n", runtime.GOOS, runtime.GOARCH)
	fmt.Fprintf(f, "- **CPU Cores**: %d\n", runtime.NumCPU())
	fmt.Fprintf(f, "- **Go Version**: %s\n\n", runtime.Version())

	// 1. Throughput Table
	fmt.Fprintf(f, "## Throughput (RPS)\n\n")
	fmt.Fprintf(f, "| Target |")
	catKeys := selectedCategories()
	for _, k := range catKeys {
		fmt.Fprintf(f, " %s |", k)
	}
	fmt.Fprintf(f, "\n|---|")
	for range catKeys {
		fmt.Fprintf(f, "---|")
	}
	fmt.Fprintf(f, "\n")

	targetsMap := make(map[string]bool)
	var targetNames []string
	for _, s := range all {
		if !targetsMap[s.Target] {
			targetsMap[s.Target] = true
			targetNames = append(targetNames, s.Target)
		}
	}
	sort.Strings(targetNames)

	for _, name := range targetNames {
		fmt.Fprintf(f, "| %s |", name)
		for _, k := range catKeys {
			val := "—"
			for _, s := range all {
				if s.Target == name && s.CategoryKey == k {
					val = fmt.Sprintf("%.0f", s.RPS)
					break
				}
			}
			fmt.Fprintf(f, " %s |", val)
		}
		fmt.Fprintf(f, "\n")
	}
	fmt.Fprintf(f, "\n")

	// 2. Resource Footprint
	fmt.Fprintf(f, "## Resource Footprint (Peak Memory Usage)\n\n")
	fmt.Fprintf(f, "| Target | Peak RSS (MB) |\n")
	fmt.Fprintf(f, "|---|---|\n")
	
	var peakKeys []string
	for k := range peakMemory {
		peakKeys = append(peakKeys, k)
	}
	sort.Strings(peakKeys)
	
	for _, id := range peakKeys {
		kb := peakMemory[id]
		fmt.Fprintf(f, "| %s | %.2f MB |\n", id, float64(kb)/1024.0)
	}
	fmt.Fprintf(f, "\n")

	// 3. Detailed Latency Scenarios
	fmt.Fprintf(f, "## Detailed Latency & Correctness metrics\n\n")
	for _, k := range catKeys {
		label := categories[k].Label
		fmt.Fprintf(f, "### %s\n\n", label)
		fmt.Fprintf(f, "| Target | RPS | P50 (ms) | P90 (ms) | P95 (ms) | P99 (ms) | P99.9 (ms) | Avg (ms) | StdDev (ms) | Errors |\n")
		fmt.Fprintf(f, "|---|---|---|---|---|---|---|---|---|---|\n")

		var catStats []stats
		for _, s := range all {
			if s.CategoryKey == k {
				catStats = append(catStats, s)
			}
		}
		sort.Slice(catStats, func(i, j int) bool { return catStats[i].RPS > catStats[j].RPS })

		for _, s := range catStats {
			fmt.Fprintf(f, "| %s | %.0f | %.2f | %.2f | %.2f | %.2f | %.2f | %.2f | %.2f | %d |\n",
				s.Target, s.RPS, s.P50Ms, s.P90Ms, s.P95Ms, s.P99Ms, s.P999Ms, s.AvgMs, s.StdDevMs, s.Errors)
		}
		fmt.Fprintf(f, "\n")
	}
	fmt.Printf("\nWrote Markdown report: %s\n", path)
}
