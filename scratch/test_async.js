import { createOgerBenchApp } from "../benchmark/targets/ogerjs/app.ts";

const app = createOgerBenchApp();
app.compile();

const req = new Request("http://localhost/bench/async-io");
app.handle(req).then(async (res) => {
	console.log("Status:", res.status);
	console.log("Text:", await res.text());
}).catch((err) => {
	console.error("Error:", err);
});
