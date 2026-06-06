import { serve } from "@hono/node-server";
import { createHonoBenchApp } from "../honojs/app.ts";

const port = Number(process.env.PORT ?? 3008);
const app = createHonoBenchApp();

if (import.meta.main) {
	serve({
		fetch: app.fetch,
		port,
		hostname: "127.0.0.1",
	});
	console.log(`Hono (Node) listening on http://127.0.0.1:${port}`);
}
