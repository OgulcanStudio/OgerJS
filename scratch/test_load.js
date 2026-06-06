import { createOgerBenchApp } from "../benchmark/targets/ogerjs/app.ts";

const app = createOgerBenchApp();
const server = app.listen({ port: 3003, hostname: "127.0.0.1" });

console.log("Server started on port 3003. Starting load...");

const promises = Array.from({ length: 1000 }, (_, i) => {
	return fetch("http://127.0.0.1:3003/bench/async-io")
		.then(async (res) => {
			if (res.status !== 200) {
				console.log(`Req ${i} failed: Status ${res.status}, Text: ${await res.text()}`);
			}
			return res.status;
		})
		.catch((err) => {
			console.error(`Req ${i} fetch error:`, err);
			return 500;
		});
});

Promise.all(promises).then((results) => {
	const ok = results.filter(s => s === 200).length;
	const fail = results.length - ok;
	console.log(`Done. OK: ${ok}, FAIL: ${fail}`);
	server.stop();
	process.exit(0);
});
