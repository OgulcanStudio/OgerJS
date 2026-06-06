import { createHonoBenchApp } from "./app.ts";

const port = Number(process.env.PORT ?? 3004);
const app = createHonoBenchApp();

if (import.meta.main) {
	Bun.serve({
		port,
		hostname: "127.0.0.1",
		fetch: app.fetch,
	});
	console.log(`Hono (Bun) listening on http://127.0.0.1:${port}`);
}
