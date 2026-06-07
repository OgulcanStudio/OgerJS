import { OgerError } from "./error";
import { isJsonContentType, readJsonBody, readLimitedText } from "./json";
import type { Context, SetHeaders } from "./types";
import { OgerResponse } from "./response";

const EMPTY_QUERY: Record<string, string> = Object.freeze({});

function safeDecode(str: string): string {
	try {
		return decodeURIComponent(str);
	} catch {
		return str;
	}
}

function parseQueryString(str: string): Record<string, string> {
	if (!str) return EMPTY_QUERY;
	const query: Record<string, string> = Object.create(null);
	let start = 0;
	while (start < str.length) {
		let eq = str.indexOf("=", start);
		let end = str.indexOf("&", start);
		if (end === -1) end = str.length;
		if (eq === -1 || eq > end) {
			const key = str.substring(start, end);
			query[safeDecode(key)] = "";
		} else {
			const key = str.substring(start, eq);
			const val = str.substring(eq + 1, end);
			query[safeDecode(key)] = safeDecode(val);
		}
		start = end + 1;
	}
	return query;
}

function buildHeaders(request: Request): Record<string, string> {
	if ((request as any)._isOgerNodeRequest) {
		const raw = (request as any)._nodeReq.headers;
		const headers: Record<string, string> = Object.create(null);
		for (const k in raw) {
			const v = raw[k];
			if (v !== undefined) {
				headers[k] = Array.isArray(v) ? v.join(", ") : v;
			}
		}
		return headers;
	}
	const headers: Record<string, string> = Object.create(null);
	request.headers.forEach((v, k) => {
		headers[k.toLowerCase()] = v;
	});
	return headers;
}

function buildQuery(request: Request): Record<string, string> {
	if ((request as any)._isOgerNodeRequest) {
		return parseQueryString((request as any)._ogerQueryString);
	}
	const url = request.url;
	const idx = url.indexOf("?");
	if (idx === -1) return EMPTY_QUERY;
	return parseQueryString(url.substring(idx + 1));
}

export class OgerContext implements Context {
	[key: string]: any;
	request: Request;
	params: Record<string, string>;
	store: Record<string, unknown>;
	route: string;
	server: import("bun").Server<undefined> | null;

	_set?: SetHeaders;
	_cookie?: Record<string, { value: string }>;
	private _headersCache?: Record<string, string>;
	private _queryCache?: Record<string, string>;
	private _bodyCache?: unknown;
	private _bodyParsed: boolean = false;

	constructor(
		request: Request,
		route: string,
		store: Record<string, unknown>,
		params: Record<string, string>
	) {
		this.request = request;
		this.route = route;
		this.store = store;
		this.params = params;
		this.server = null;
		this._set = undefined;
		this._cookie = undefined;
		this._headersCache = undefined;
		this._queryCache = undefined;
		this._bodyCache = undefined;
		this._bodyParsed = false;
	}

	get set() {
		if (!this._set) this._set = {};
		return this._set;
	}
	set set(v: SetHeaders) {
		this._set = v;
	}

	get cookie() {
		if (!this._cookie) this._cookie = {};
		return this._cookie;
	}
	set cookie(v: Record<string, { value: string }>) {
		this._cookie = v;
	}

	get query() {
		if (!this._queryCache) this._queryCache = buildQuery(this.request);
		return this._queryCache;
	}
	set query(v: Record<string, string>) {
		this._queryCache = v;
	}

	get headers() {
		if (!this._headersCache) this._headersCache = buildHeaders(this.request);
		return this._headersCache;
	}
	set headers(v: Record<string, string>) {
		this._headersCache = v;
	}

	get body() {
		return this._bodyCache;
	}
	set body(v: unknown) {
		this._bodyCache = v;
		this._bodyParsed = true;
	}

	_getBodyParsed() {
		return !!this._bodyParsed;
	}
	_setBodyParsed(v: boolean) {
		this._bodyParsed = v;
	}
}

export function createContext(
	request: Request,
	route: string,
	store: Record<string, unknown>,
	params: Record<string, string> = {},
): Context {
	return new OgerContext(request, route, store, params);
}

export async function parseBody(
	request: Request,
	limit: number,
): Promise<unknown> {
	let contentType = (request as any)._contentType;
	if (contentType === undefined) {
		contentType = request.headers.get("content-type") ?? "";
		(request as any)._contentType = contentType;
	}
	if (!contentType) return undefined;

	let rawLength = (request as any)._contentLength;
	if (rawLength === undefined) {
		rawLength = request.headers.get("content-length");
		(request as any)._contentLength = rawLength;
	}

	let contentLength: number | undefined = undefined;
	if (rawLength !== null && rawLength !== undefined) {
		contentLength = Number(rawLength);
		if (!Number.isFinite(contentLength) || contentLength < 0) {
			throw new OgerError(
				"Invalid Content-Length",
				400,
				"INVALID_CONTENT_LENGTH",
			);
		}
		if (contentLength > limit) {
			throw new OgerError("Payload too large", 413, "PAYLOAD_TOO_LARGE");
		}
	}

	if (isJsonContentType(contentType)) {
		return readJsonBody(request, limit, contentLength);
	}
	if (contentType.includes("application/x-www-form-urlencoded")) {
		const text = await readLimitedText(request, limit);
		const params = new URLSearchParams(text);
		const out: Record<string, string> = {};
		params.forEach((v, k) => {
			out[k] = v;
		});
		return out;
	}
	if (contentType.includes("multipart/form-data")) {
		if (rawLength === null) {
			throw new OgerError("Content-Length required", 411, "LENGTH_REQUIRED");
		}
		const form = await request.formData();
		const out: Record<string, unknown> = {};
		form.forEach((v, k) => {
			out[k] = v;
		});
		return out;
	}
	return undefined;
}

function buildInit(set?: SetHeaders, defaultStatus?: number): ResponseInit | undefined {
	if (!set || (set.status === undefined && !set.headers && !set.redirect && !set.cookie)) {
		return defaultStatus !== undefined ? { status: defaultStatus } : undefined;
	}

	const isNode = typeof Bun === "undefined";
	const headers: any = isNode ? {} : new Headers();

	if (set.headers) {
		for (const k in set.headers) {
			if (Object.prototype.hasOwnProperty.call(set.headers, k)) {
				const val = set.headers[k];
				if (isNode) {
					headers[k] = val;
				} else {
					headers.set(k, val);
				}
			}
		}
	}
	if (set.redirect) {
		if (isNode) {
			headers["Location"] = set.redirect;
		} else {
			headers.set("Location", set.redirect);
		}
	}
	if (set.cookie) {
		for (const name in set.cookie) {
			if (Object.prototype.hasOwnProperty.call(set.cookie, name)) {
				const opts = set.cookie[name];
				const httpOnly = opts.httpOnly ?? true;
				const secure = opts.secure ?? process.env.NODE_ENV === "production";
				const sameSite = opts.sameSite ?? "lax";
				let c = `${name}=${encodeURIComponent(opts.value)}`;
				c += `; Path=${opts.path ?? "/"}`;
				if (opts.maxAge !== undefined) c += `; Max-Age=${opts.maxAge}`;
				if (httpOnly) c += "; HttpOnly";
				if (secure) c += "; Secure";
				c += `; SameSite=${sameSite.charAt(0).toUpperCase()}${sameSite.slice(1)}`;
				
				if (isNode) {
					const existing = headers["Set-Cookie"];
					if (!existing) {
						headers["Set-Cookie"] = c;
					} else {
						if (Array.isArray(existing)) {
							existing.push(c);
						} else {
							headers["Set-Cookie"] = [existing, c];
						}
					}
				} else {
					headers.append("Set-Cookie", c);
				}
			}
		}
	}

	return {
		status: set.redirect ? (set.status ?? 302) : (set.status ?? defaultStatus),
		headers
	};
}

export function applySetHeaders(response: Response, set: SetHeaders): Response {
	if (
		set.status === undefined &&
		!set.headers &&
		!set.redirect &&
		!set.cookie
	) {
		return response;
	}

	let status = response.status;
	const isNode = typeof Bun === "undefined";

	if (isNode && (response as any)._isOgerResponse) {
		const ogerRes = response as any;
		const newRaw: Record<string, string | string[]> = {};
		if (ogerRes._rawHeaders) {
			const raw = ogerRes._rawHeaders;
			for (const k in raw) {
				if (Object.prototype.hasOwnProperty.call(raw, k)) {
					const val = raw[k];
					newRaw[k] = Array.isArray(val) ? [...val] : val;
				}
			}
		} else if (ogerRes._headers) {
			const map = ogerRes._headers._map;
			for (const k in map) {
				const val = map[k];
				newRaw[k] = val.length === 1 ? val[0] : [...val];
			}
		}

		if (set.status !== undefined) status = set.status;
		if (set.headers) {
			for (const k in set.headers) {
				if (Object.prototype.hasOwnProperty.call(set.headers, k)) {
					newRaw[k] = set.headers[k];
				}
			}
		}
		if (set.redirect) {
			newRaw["Location"] = set.redirect;
			status = set.status ?? 302;
		}
		if (set.cookie) {
			for (const name in set.cookie) {
				if (Object.prototype.hasOwnProperty.call(set.cookie, name)) {
					const opts = set.cookie[name];
					const httpOnly = opts.httpOnly ?? true;
					const secure = opts.secure ?? process.env.NODE_ENV === "production";
					const sameSite = opts.sameSite ?? "lax";
					let c = `${name}=${encodeURIComponent(opts.value)}`;
					c += `; Path=${opts.path ?? "/"}`;
					if (opts.maxAge !== undefined) c += `; Max-Age=${opts.maxAge}`;
					if (httpOnly) c += "; HttpOnly";
					if (secure) c += "; Secure";
					c += `; SameSite=${sameSite.charAt(0).toUpperCase()}${sameSite.slice(1)}`;

					const existing = newRaw["Set-Cookie"];
					if (!existing) {
						newRaw["Set-Cookie"] = c;
					} else {
						if (Array.isArray(existing)) {
							existing.push(c);
						} else {
							newRaw["Set-Cookie"] = [existing, c];
						}
					}
				}
			}
		}

		const cloned = new OgerResponse(ogerRes.body, { status }) as unknown as Response;
		(cloned as any)._rawBody = ogerRes._rawBody;
		(cloned as any)._rawHeaders = newRaw;
		return cloned;
	}

	const headers = new Headers(response.headers);

	if (set.status !== undefined) status = set.status;
	if (set.headers) {
		for (const k in set.headers) {
			if (Object.prototype.hasOwnProperty.call(set.headers, k)) {
				headers.set(k, set.headers[k]);
			}
		}
	}
	if (set.redirect) {
		headers.set("Location", set.redirect);
		status = set.status ?? 302;
	}
	if (set.cookie) {
		for (const name in set.cookie) {
			if (Object.prototype.hasOwnProperty.call(set.cookie, name)) {
				const opts = set.cookie[name];
				const httpOnly = opts.httpOnly ?? true;
				const secure = opts.secure ?? process.env.NODE_ENV === "production";
				const sameSite = opts.sameSite ?? "lax";
				let c = `${name}=${encodeURIComponent(opts.value)}`;
				c += `; Path=${opts.path ?? "/"}`;
				if (opts.maxAge !== undefined) c += `; Max-Age=${opts.maxAge}`;
				if (httpOnly) c += "; HttpOnly";
				if (secure) c += "; Secure";
				c += `; SameSite=${sameSite.charAt(0).toUpperCase()}${sameSite.slice(1)}`;
				headers.append("Set-Cookie", c);
			}
		}
	}

	return new Response(set.redirect ? null : response.body, { status, headers });
}

const JSON_RESPONSE_INIT = {
	headers: { "content-type": "application/json" },
};

export function toResponse(value: unknown, set?: SetHeaders): Response {
	if (!set || !(set.status !== undefined || set.headers || set.redirect || set.cookie)) {
		if (typeof value === "string") {
			const res = new Response(value);
			if (typeof Bun === "undefined") (res as any)._rawBody = value;
			return res;
		}
		if (value instanceof Response) {
			return value;
		}
		if (value === undefined || value === null) {
			const res = new Response(null, { status: 204 });
			if (typeof Bun === "undefined") (res as any)._rawBody = "";
			return res;
		}
		if (typeof value === "number" || typeof value === "boolean") {
			const str = String(value);
			const res = new Response(str);
			if (typeof Bun === "undefined") (res as any)._rawBody = str;
			return res;
		}
		const str = JSON.stringify(value);
		const res = new Response(str, JSON_RESPONSE_INIT);
		if (typeof Bun === "undefined") (res as any)._rawBody = str;
		return res;
	}

	if (typeof value === "string") {
		const res = new Response(value, buildInit(set));
		if (typeof Bun === "undefined") (res as any)._rawBody = value;
		return res;
	}
	if (value instanceof Response) {
		return applySetHeaders(value, set);
	}
	if (value === undefined || value === null) {
		const res = new Response(null, buildInit(set, 204));
		if (typeof Bun === "undefined") (res as any)._rawBody = "";
		return res;
	}
	if (typeof value === "number" || typeof value === "boolean") {
		const str = String(value);
		const res = new Response(str, buildInit(set));
		if (typeof Bun === "undefined") (res as any)._rawBody = str;
		return res;
	}
	const init = buildInit(set) || {};
	const headers = new Headers(init.headers as any);
	headers.set("content-type", "application/json");
	const str = JSON.stringify(value);
	const res = new Response(str, { ...init, headers });
	if (typeof Bun === "undefined") (res as any)._rawBody = str;
	return res;
}
