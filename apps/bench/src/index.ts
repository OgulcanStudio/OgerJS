import { Oger } from "@ogerjs/core";

const app = new Oger({ bodyLimit: 1024 * 512 })
	.get("/", () => "ok")
	.get("/json", () => ({ ok: true }));

if (import.meta.main) {
	const port = Number(process.env.PORT ?? 4000);
	app.listen({ port, bodyLimit: 1024 * 512 });
	console.log(`Bench server http://localhost:${port}`);
}

export { app };
