package main

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"strings"
)

func runBench(runNum int) (string, error) {
	fmt.Printf("\n=================== STARTING RUN %d ===================\n", runNum)
	cmd := exec.Command("go", "run", "benchmark.go")
	cmd.Dir = "c:/Projects/OgerJS/benchmark"
	cmd.Env = append(os.Environ(),
		"BENCH_REQUESTS=3000",
		"BENCH_WARMUP=500",
	)

	var stdoutBuf, stderrBuf bytes.Buffer
	cmd.Stdout = &stdoutBuf
	cmd.Stderr = &stderrBuf

	err := cmd.Run()
	if err != nil {
		return "", fmt.Errorf("run %d failed: %w\nstderr: %s", runNum, err, stderrBuf.String())
	}
	return stdoutBuf.String(), nil
}

type category struct {
	label   string
	fastest string
}

func parseAndVerify(stdout string, runNum int) bool {
	lines := strings.Split(stdout, "\n")
	var categories []category
	fastestOk := true

	// Regexp to strip non-ascii decoration
	nonAsciiReg := regexp.MustCompile(`[^\x20-\x7E]`)
	fastestReg := regexp.MustCompile(`fastest:\s*(.+?)\s*\(\d+\s+req`)

	for _, line := range lines {
		// Detect category header: contains "GET /" or "POST /" and not req/s or fastest
		if (strings.Contains(line, "GET /") || strings.Contains(line, "POST /")) &&
			!strings.Contains(line, "req/s") &&
			!strings.Contains(line, "fastest:") {
			label := strings.TrimSpace(nonAsciiReg.ReplaceAllString(line, ""))
			categories = append(categories, category{label: label})
		}
		if strings.Contains(line, "fastest:") {
			if len(categories) > 0 {
				match := fastestReg.FindStringSubmatch(line)
				if len(match) > 1 {
					categories[len(categories)-1].fastest = strings.TrimSpace(match[1])
				}
			}
		}
	}

	fmt.Printf("\nVerification Results for Run %d:\n", runNum)
	for _, cat := range categories {
		isOger := strings.Contains(cat.fastest, "OgerJS (Bun)")
		status := "FAIL"
		if isOger {
			status = "PASS"
		} else {
			fastestOk = false
		}
		fmt.Printf("  - %s: Fastest = %s [%s]\n", cat.label, cat.fastest, status)
	}

	return fastestOk
}

func main() {
	allPassed := true
	for run := 1; run <= 5; run++ {
		stdout, err := runBench(run)
		if err != nil {
			fmt.Printf("Error in Run %d: %v\n", run, err)
			allPassed = false
			break
		}
		// Print full stdout to console
		fmt.Print(stdout)

		passed := parseAndVerify(stdout, run)
		if !passed {
			allPassed = false
			fmt.Printf("Run %d failed: OgerJS was not the fastest in all categories.\n", run)
		} else {
			fmt.Printf("Run %d passed successfully!\n", run)
		}
	}

	if allPassed {
		fmt.Println("\n=============================================")
		fmt.Println("SUCCESS: OgerJS is the fastest in all categories across all 5 runs!")
		fmt.Println("=============================================")
		os.Exit(0)
	} else {
		fmt.Println("\n=============================================")
		fmt.Println("FAILURE: OgerJS was not consistently the fastest.")
		fmt.Println("=============================================")
		os.Exit(1)
	}
}
