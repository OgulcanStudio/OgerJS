const bodyObj = {
	items: Array.from({ length: 32 }, (_, i) => ({
		id: i,
		name: `item-${i}`,
		tags: ["bench", "json-parse"],
	})),
	meta: { source: "benchmark", version: 1 },
};
const jsonStr = JSON.stringify(bodyObj);

// Mock request-like behavior using Bun's native Response/Request
const createRequest = () => new Request("http://localhost/", {
	method: "POST",
	headers: { "content-type": "application/json" },
	body: jsonStr,
});

async function runTextParse() {
	const req = createRequest();
	const text = await req.text();
	return JSON.parse(text);
}

async function runJsonNative() {
	const req = createRequest();
	return await req.json();
}

// Warmup
for (let i = 0; i < 10000; i++) {
	await runTextParse();
	await runJsonNative();
}

const ITERATIONS = 100000;

console.time("Text + JSON.parse");
for (let i = 0; i < ITERATIONS; i++) {
	await runTextParse();
}
console.timeEnd("Text + JSON.parse");

console.time("Native request.json()");
for (let i = 0; i < ITERATIONS; i++) {
	await runJsonNative();
}
console.timeEnd("Native request.json()");
