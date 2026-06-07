import { pathToFileURL } from "node:url";

let mainUrl = "";
try {
	if (process.argv[1]) {
		mainUrl = pathToFileURL(process.argv[1]).href;
	}
} catch {}

const BUN_SHIM_URLS: Record<string, string> = {
	bun: new URL("./bun-shim.js", import.meta.url).href,
	"bun:sqlite": new URL("./sqlite.js", import.meta.url).href,
	"bun:jsc": new URL("./jsc.js", import.meta.url).href,
	"bun:ffi": new URL("./ffi.js", import.meta.url).href,
	"bun:test": new URL("./test-shim.js", import.meta.url).href,
};

function resolveBunShim(specifier: string) {
	const shimUrl = BUN_SHIM_URLS[specifier];
	if (!shimUrl) return null;
	return { shortCircuit: true, url: shimUrl };
}

function injectMainFlag(result: { format?: string; source?: string | Uint8Array }, url: string) {
	if (result.format !== "module" || !result.source) return;
	const isMain = !!(mainUrl && url.toLowerCase() === mainUrl.toLowerCase());
	const injectStr = `import.meta.main = ${isMain};\n`;
	if (typeof result.source === "string") {
		result.source = injectStr + result.source;
	} else if (result.source instanceof Uint8Array) {
		const prependBuf = Buffer.from(injectStr);
		const newSource = new Uint8Array(prependBuf.length + result.source.length);
		newSource.set(prependBuf, 0);
		newSource.set(result.source, prependBuf.length);
		result.source = newSource;
	}
}

function trackMainEntry(specifier: string, context: any, result: { url: string }) {
	if (!context.parentURL && !specifier.includes("register")) {
		mainUrl = result.url;
	}
}

export function resolveSync(specifier: string, context: any, nextResolve: any) {
	const shim = resolveBunShim(specifier);
	if (shim) return shim;
	const result = nextResolve(specifier, context);
	trackMainEntry(specifier, context, result);
	return result;
}

export function loadSync(url: string, context: any, nextLoad: any) {
	const result = nextLoad(url, context);
	injectMainFlag(result, url);
	return result;
}

export async function resolve(
	specifier: string,
	context: any,
	nextResolve: any,
) {
	const shim = resolveBunShim(specifier);
	if (shim) return shim;
	const result = await nextResolve(specifier, context);
	trackMainEntry(specifier, context, result);
	return result;
}

export async function load(
	url: string,
	context: any,
	nextLoad: any,
) {
	const result = await nextLoad(url, context);
	injectMainFlag(result, url);
	return result;
}


