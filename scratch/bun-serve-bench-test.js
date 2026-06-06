// Run benchmark for routes vs fetch
import { spawn } from "node:child_process";

const serveRoutesStatic = () => {
  return Bun.serve({
    port: 9871,
    routes: {
      "/": new Response("ok")
    }
  });
};

const serveFetchFunc = () => {
  return Bun.serve({
    port: 9872,
    fetch(req) {
      return new Response("ok");
    }
  });
};

const serveRoutesFunc = () => {
  return Bun.serve({
    port: 9873,
    routes: {
      "/": () => new Response("ok")
    }
  });
};

const runBenchForPort = async (port) => {
  const command = "bun";
  const workerPath = "benchmark/load-worker.js";
  const env = {
    ...process.env,
    BENCH_DURATION_SEC: "1",
    BENCH_WARMUP_SEC: "0.2",
    BENCH_CONCURRENCY: "32",
    BENCH_PIPELINE_DEPTH: "2",
    BENCH_SAMPLE_MAX: "10000",
    BENCH_METHOD: "GET",
    BENCH_BODY: "",
    BENCH_AUTH: "0",
  };

  return new Promise((resolve) => {
    const proc = spawn(command, [workerPath, String(port), "/"], { env });
    let stdout = "";
    proc.stdout?.on("data", (chunk) => { stdout += chunk; });
    proc.on("close", () => {
      try {
        resolve(JSON.parse(stdout).rps);
      } catch {
        resolve(0);
      }
    });
  });
};

const s1 = serveRoutesStatic();
const rps1 = await runBenchForPort(9871);
s1.stop();

const s2 = serveFetchFunc();
const rps2 = await runBenchForPort(9872);
s2.stop();

const s3 = serveRoutesFunc();
const rps3 = await runBenchForPort(9873);
s3.stop();

console.log("Routes Static RPS:", rps1);
console.log("Fetch Function RPS:", rps2);
console.log("Routes Function RPS:", rps3);
