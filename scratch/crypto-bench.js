const data = new TextEncoder().encode("enterprise-grade-async-io-simulation");
const start = performance.now();
const runs = 10000;
for (let i = 0; i < runs; i++) {
	await crypto.subtle.digest("SHA-256", data);
}
const elapsed = performance.now() - start;
console.log(`crypto.subtle.digest throughput: ${(runs / (elapsed / 1000)).toFixed(0)} ops/sec`);
