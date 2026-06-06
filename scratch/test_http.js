import { createOgerBenchApp } from "../benchmark/targets/ogerjs/app.ts";

const app = createOgerBenchApp();
const server = app.listen({ port: 3003, hostname: "127.0.0.1" });

console.log("Server started on port 3003");

fetch("http://127.0.0.1:3003/bench/async-io")
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
