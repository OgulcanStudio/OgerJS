export interface InjectOptions {
	/** HTTP method. Default `GET`. */
	method?: string;
	/** Path only (e.g. `/users/1`). Combined with optional `query`. */
	path?: string;
	/** Full URL; overrides `path` + `query`. */
	url?: string;
	headers?: Record<string, string>;
	/** JSON-serializable body; sets `content-type: application/json` when present. */
	body?: unknown;
	query?: Record<string, string>;
}

function buildUrl(options: InjectOptions): string {
	if (options.url) return options.url;
	const path = options.path ?? "/";
	if (!options.query || Object.keys(options.query).length === 0) {
		return `http://localhost${path.startsWith("/") ? path : `/${path}`}`;
	}
	const qs = new URLSearchParams(options.query).toString();
	const base = path.startsWith("/") ? path : `/${path}`;
	return `http://localhost${base}?${qs}`;
}

/** Build a `Request` for in-process testing (`app.inject` / `app.handle`). */
export function buildInjectRequest(
	pathOrOptions: string | InjectOptions,
	init?: RequestInit,
): Request {
	const options: InjectOptions =
		typeof pathOrOptions === "string" ? { path: pathOrOptions } : pathOrOptions;

	const method = (init?.method ?? options.method ?? "GET").toUpperCase();
	const url = buildUrl(options);
	const headers = new Headers(init?.headers);

	for (const [k, v] of Object.entries(options.headers ?? {})) {
		if (!headers.has(k)) headers.set(k, v);
	}

	let body: RequestInit["body"] = init?.body ?? undefined;
	if (options.body !== undefined && body === undefined) {
		if (!headers.has("content-type"))
			headers.set("content-type", "application/json");
		body = JSON.stringify(options.body);
	}

	return new Request(url, {
		...init,
		method,
		headers,
		body,
	});
}
