import { createOgerBenchApp } from "./app.ts";

const port = Number(process.env.PORT ?? 3003);
const app = createOgerBenchApp();

if (import.meta.main) {
	app.listen({ port, hostname: "127.0.0.1", dispatch: "routes" });
	console.log(`OgerJS (Bun) listening on http://127.0.0.1:${port}`);
}
