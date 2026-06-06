import { Oger, t } from "@ogerjs/core";
import { cors } from "@ogerjs/cors";
import { json } from "@ogerjs/json";

const app = new Oger()
	.use(cors())
	.use(json())
	.get("/", () => "Hello from OgerJS!")
	.get(
		"/health",
		() =>
			new Response(JSON.stringify({ status: "ok" }), {
				headers: { "content-type": "application/json" },
			}),
	)
	.post("/echo", ({ body }) => body, {
		body: t.Object({ message: t.String() }),
	});

const port = Number(process.env.PORT ?? 3000);
if (import.meta.main) {
	app.listen(port);
	console.log(`Example basic listening on http://localhost:${port}`);
}

export { app };
