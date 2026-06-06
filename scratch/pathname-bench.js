const originalPathname = (url) => {
	const proto = url.indexOf("://");
	const start = proto === -1 ? 0 : url.indexOf("/", proto + 3);
	if (start === -1) return "/";
	const query = url.indexOf("?", start);
	const hash = url.indexOf("#", start);
	let end = url.length;
	if (query !== -1 && query < end) end = query;
	if (hash !== -1 && hash < end) end = hash;
	const path = url.slice(start, end);
	return path || "/";
};

const superOptimizedPathname = (url) => {
	if (url.charCodeAt(0) === 47) {
		const query = url.indexOf("?");
		if (query === -1) {
			const hash = url.indexOf("#");
			if (hash === -1) return url;
			return url.substring(0, hash);
		}
		const hash = url.indexOf("#");
		if (hash !== -1 && hash < query) return url.substring(0, hash);
		return url.substring(0, query);
	}
	const start = url.indexOf("/", url.charCodeAt(4) === 115 ? 8 : 7);
	if (start === -1) return "/";
	const query = url.indexOf("?", start);
	if (query === -1) {
		const hash = url.indexOf("#", start);
		if (hash === -1) return url.substring(start);
		return url.substring(start, hash);
	}
	const hash = url.indexOf("#", start);
	if (hash !== -1 && hash < query) return url.substring(start, hash);
	return url.substring(start, query);
};

const urls = [
	"http://127.0.0.1:3003/",
	"http://127.0.0.1:3003/bench/json-parse",
	"http://127.0.0.1:3003/bench/item/42",
	"https://localhost/bench/auth?query=1#hash",
	"/bench/async-io"
];

console.log("Original: ");
for (const url of urls) {
	console.log(`  ${url} -> ${originalPathname(url)}`);
}

console.log("Super Optimized: ");
for (const url of urls) {
	console.log(`  ${url} -> ${superOptimizedPathname(url)}`);
}

// Warmup
for (let i = 0; i < 100000; i++) {
	for (const url of urls) {
		originalPathname(url);
		superOptimizedPathname(url);
	}
}

console.time("Original");
for (let i = 0; i < 10000000; i++) {
	for (const url of urls) {
		originalPathname(url);
	}
}
console.timeEnd("Original");

console.time("Super Optimized");
for (let i = 0; i < 10000000; i++) {
	for (const url of urls) {
		superOptimizedPathname(url);
	}
}
console.timeEnd("Super Optimized");
