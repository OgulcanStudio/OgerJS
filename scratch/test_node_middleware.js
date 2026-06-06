// Force Node compat mode
globalThis.FORCE_NODE_COMPAT = true;

import { createOgerBenchApp } from "../benchmark/targets/ogerjs/app.ts";

const app = createOgerBenchApp();
const server = app.listen({ port: 3007, hostname: "127.0.0.1" });

console.log("Node.js server started on port 3007");

// Make request with X-Bench-Step header
fetch("http://127.0.0.1:3007/bench/middleware", {
	headers: { "X-Bench-Step": "3" }
})
	.then(async (res) => {
		console.log("Status:", res.status);
		console.log("Text:", await res.text());
		server.stop();
		process.exit(0);
	})
	.catch((err) => {
		console.error("Fetch Error:", err);
		server.stop();
		process.exit(1);
	});
