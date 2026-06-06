const staticRes = new Response("ok", { headers: { "content-type": "application/json" } });
const headersInit = { "content-type": "application/json" };
const jsonResponseInit = { headers: headersInit };

function runStaticCloned() {
	return staticRes.clone();
}

function runNewResponseDynamic() {
	return new Response("ok", { headers: { "content-type": "application/json" } });
}

function runNewResponseSharedInit() {
	return new Response("ok", jsonResponseInit);
}

const ITERATIONS = 2000000;

// Warmup
for (let i = 0; i < 100000; i++) {
	runStaticCloned();
	runNewResponseDynamic();
	runNewResponseSharedInit();
}

console.time("Cloned");
for (let i = 0; i < ITERATIONS; i++) {
	runStaticCloned();
}
console.timeEnd("Cloned");

console.time("New Response Dynamic Headers");
for (let i = 0; i < ITERATIONS; i++) {
	runNewResponseDynamic();
}
console.timeEnd("New Response Dynamic Headers");

console.time("New Response Shared Init");
for (let i = 0; i < ITERATIONS; i++) {
	runNewResponseSharedInit();
}
console.timeEnd("New Response Shared Init");
