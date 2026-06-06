import { Oger } from "@ogerjs/core";

const ITERATIONS = Number(process.env.BENCH_ITERATIONS ?? 10_000);

async function benchOger() {
	const app = new Oger()
		.get("/", () => "ok")
		.get("/users/:id", ({ params }) => params.id);
	app.compile();

	const start = performance.now();
	for (let i = 0; i < ITERATIONS; i++) {
		await app.handle(new Request("http://localhost/users/1"));
	}
	const ms = performance.now() - start;
	return {
		name: "ogerjs",
		iterations: ITERATIONS,
		ms,
		rps: (ITERATIONS / ms) * 1000,
	};
}

async function benchRawBun() {
	const server = Bun.serve({
		port: 0,
		routes: {
			"/users/:id": (_req) => new Response("1"),
		},
		fetch() {
			return new Response("not found", { status: 404 });
		},
	});

	const start = performance.now();
	for (let i = 0; i < ITERATIONS; i++) {
		await server.fetch(new Request("http://localhost/users/1"));
	}
	const ms = performance.now() - start;
	server.stop();
	return {
		name: "raw-bun",
		iterations: ITERATIONS,
		ms,
		rps: (ITERATIONS / ms) * 1000,
	};
}

async function main() {
	const results = [await benchOger(), await benchRawBun()];
	console.table(results);
}

if (import.meta.main) main();
