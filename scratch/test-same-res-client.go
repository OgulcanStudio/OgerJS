package main

import (
	"fmt"
	"net/http"
	"sync"
	"time"
)

func main() {
	client := &http.Client{
		Timeout: 5 * time.Second,
		Transport: &http.Transport{
			MaxIdleConns:        128,
			MaxIdleConnsPerHost: 128,
		},
	}

	concurrency := 128
	totalRequests := 1000

	sem := make(chan struct{}, concurrency)
	var wg sync.WaitGroup
	errs := 0
	var mu sync.Mutex

	start := time.Now()
	for i := 0; i < totalRequests; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			resp, err := client.Get("http://127.0.0.1:8089/")
			if err != nil {
				mu.Lock()
				errs++
				mu.Unlock()
				return
			}
			defer resp.Body.Close()

			if resp.StatusCode != 200 {
				mu.Lock()
				errs++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	elapsed := time.Since(start)

	fmt.Printf("Completed %d requests in %v with %d errors\n", totalRequests, elapsed, errs)
}
