import { createOgerBenchApp } from "../ogerjs/app.ts";

const port = Number(process.env.PORT ?? 3007);
const app = createOgerBenchApp();

if (import.meta.main) {
	app.listen({ port, hostname: "127.0.0.1" });
	console.log(`OgerJS (Node) listening on http://127.0.0.1:${port}`);
}
