import { Router } from "./src/router";

// Setup base routes
const routes = [
	{ method: "GET", path: "/" },
	{ method: "GET", path: "/health" },
	{ method: "POST", path: "/users" },
	{ method: "GET", path: "/users/:id" },
	{ method: "GET", path: "/users/:id/posts" },
	{ method: "GET", path: "/users/:id/posts/:postId" },
	{ method: "GET", path: "/static/a/b/c/d" },
];

// Add 400 dummy routes to simulate a real-world, large application routing table
// Placing them before/after to simulate average search depths.
for (let i = 0; i < 200; i++) {
	routes.push({ method: "GET", path: `/dummy-static-route-number-${i}` });
	routes.push({ method: "GET", path: `/api/users/:userId/dummy-action-${i}` });
}

// Add the wildcard and other deep routes at the end to make sequential lookup harder
routes.push({ method: "GET", path: "/wildcard/*" });

// Test cases
const testCases = [
	{ method: "GET", path: "/", label: "Static Root" },
	{ method: "GET", path: "/static/a/b/c/d", label: "Static Deep" },
	{ method: "GET", path: "/users/123", label: "Single Param" },
	{ method: "GET", path: "/users/123/posts/456", label: "Double Param" },
	{ method: "GET", path: "/wildcard/some/deep/path", label: "Wildcard" },
	{ method: "GET", path: "/not/found/path", label: "Not Found (404)" },
];

// 1. Initialize Oger Trie Router
const trieRouter = new Router<boolean>();
for (const r of routes) {
	trieRouter.add(r.method, r.path, true);
}

// 2. Prepare RegExp Router (Sequential matching)
const regExps = routes.map((r) => {
	let pattern = r.path
		.replace(/\//g, "\\/")
		.replace(/:[a-zA-Z0-9]+/g, "([^\\/]+)")
		.replace(/\*/g, "(.*)");
	// Check if wildcard
	if (r.path.endsWith("*")) {
		pattern = pattern.replace("\\/*", "(\\/.*)?");
	}
	return {
		method: r.method,
		regex: new RegExp(`^${pattern}$`),
		paramNames: (r.path.match(/:[a-zA-Z0-9]+/g) || []).map((p) => p.slice(1)),
	};
});

function matchRegExp(method: string, path: string) {
	for (let i = 0; i < regExps.length; i++) {
		const item = regExps[i];
		if (item.method !== "ALL" && item.method !== method) continue;
		const match = path.match(item.regex);
		if (match) {
			const params: Record<string, string> = {};
			for (let j = 0; j < item.paramNames.length; j++) {
				params[item.paramNames[j]] = match[j + 1];
			}
			return { handler: true, params };
		}
	}
	return null;
}

// 3. Prepare URLPattern Router (Sequential matching)
const hasURLPattern = typeof URLPattern !== "undefined";
const urlPatterns = hasURLPattern
	? routes.map((r) => {
			let patternStr = r.path;
			if (patternStr.endsWith("/*")) {
				patternStr = patternStr.slice(0, -2) + "/:wildcard*";
			}
			return {
				method: r.method,
				pattern: new URLPattern({ pathname: patternStr }),
			};
		})
	: [];

function matchURLPattern(method: string, path: string) {
	if (!hasURLPattern) return null;
	for (let i = 0; i < urlPatterns.length; i++) {
		const item = urlPatterns[i];
		if (item.method !== "ALL" && item.method !== method) continue;
		const match = item.pattern.exec({ pathname: path });
		if (match) {
			return { handler: true, params: match.pathname.groups };
		}
	}
	return null;
}

// Warmup function
function warmup() {
	for (let i = 0; i < 5000; i++) {
		for (const tc of testCases) {
			trieRouter.find(tc.method, tc.path);
			matchRegExp(tc.method, tc.path);
			if (hasURLPattern) matchURLPattern(tc.method, tc.path);
		}
	}
}

// Run benchmark
const ITERATIONS = 100_000;

console.log(`\n======================================================`);
console.log(`Router Performance Benchmark (${ITERATIONS.toLocaleString()} iterations per case)`);
console.log(`Routing Table Size: ${routes.length} routes (including 400 dummy routes)`);
console.log(`Environment: Bun ${Bun.version} | Node ${process.version}`);
console.log(`======================================================\n`);

warmup();

const results: Array<{
	testCase: string;
	trieOps: number;
	regexOps: number;
	urlPatternOps: number;
	trieTimeMs: number;
	regexTimeMs: number;
	urlPatternTimeMs: number;
}> = [];

for (const tc of testCases) {
	// Bench Oger Trie Router
	const t0 = performance.now();
	for (let i = 0; i < ITERATIONS; i++) {
		trieRouter.find(tc.method, tc.path);
	}
	const t1 = performance.now();
	const trieTime = t1 - t0;
	const trieOps = Math.round((ITERATIONS / trieTime) * 1000);

	// Bench RegExp
	const r0 = performance.now();
	for (let i = 0; i < ITERATIONS; i++) {
		matchRegExp(tc.method, tc.path);
	}
	const r1 = performance.now();
	const regexTime = r1 - r0;
	const regexOps = Math.round((ITERATIONS / regexTime) * 1000);

	// Bench URLPattern
	let urlPatternTime = 0;
	let urlPatternOps = 0;
	if (hasURLPattern) {
		const u0 = performance.now();
		for (let i = 0; i < ITERATIONS; i++) {
			matchURLPattern(tc.method, tc.path);
		}
		const u1 = performance.now();
		urlPatternTime = u1 - u0;
		urlPatternOps = Math.round((ITERATIONS / urlPatternTime) * 1000);
	}

	results.push({
		testCase: `${tc.method} ${tc.path} (${tc.label})`,
		trieOps,
		regexOps,
		urlPatternOps,
		trieTimeMs: trieTime,
		regexTimeMs: regexTime,
		urlPatternTimeMs: urlPatternTime,
	});
}

// Print results table
console.log(
	String("").padEnd(35) +
		" | " +
		String("Oger Trie Router").padStart(18) +
		" | " +
		String("Native RegExp").padStart(18) +
		" | " +
		String("URLPattern (Web API)").padStart(22),
);
console.log("-".repeat(101));

for (const res of results) {
	const label = res.testCase.padEnd(35);
	const trie = `${res.trieOps.toLocaleString()} ops/s`.padStart(18);
	const regex = `${res.regexOps.toLocaleString()} ops/s`.padStart(18);
	const urlp = hasURLPattern
		? `${res.urlPatternOps.toLocaleString()} ops/s`.padStart(22)
		: "N/A".padStart(22);
	console.log(`${label} | ${trie} | ${regex} | ${urlp}`);
}

console.log(`\nSpeed Comparison (Oger Trie vs Others):`);
console.log(`----------------------------------------`);
for (const res of results) {
	const regexRatio = (res.trieOps / res.regexOps).toFixed(1);
	const urlpRatio = hasURLPattern ? (res.trieOps / res.urlPatternOps).toFixed(1) : "N/A";
	console.log(
		`- ${res.testCase}:`,
	);
	console.log(`  * ${regexRatio}x faster than RegExp`);
	if (hasURLPattern) {
		console.log(`  * ${urlpRatio}x faster than URLPattern`);
	}
}
console.log(`\n======================================================\n`);
