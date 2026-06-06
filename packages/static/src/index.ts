import { resolve, sep } from "node:path";
import fs from "node:fs";
import { Readable } from "node:stream";
import {
	definePluginWithOptionalOptions,
	normalizeRelativePath,
} from "@ogerjs/core";

const MIME_TYPES: Record<string, string> = {
	html: "text/html; charset=utf-8",
	css: "text/css; charset=utf-8",
	js: "text/javascript; charset=utf-8",
	mjs: "text/javascript; charset=utf-8",
	json: "application/json; charset=utf-8",
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	svg: "image/svg+xml",
	ico: "image/x-icon",
	txt: "text/plain; charset=utf-8",
	xml: "application/xml; charset=utf-8",
	pdf: "application/pdf",
	zip: "application/zip",
	mp3: "audio/mpeg",
	mp4: "video/mp4",
	webm: "video/webm",
	woff: "font/woff",
	woff2: "font/woff2",
	ttf: "font/ttf",
	otf: "font/otf",
	wasm: "application/wasm",
};

function getMimeType(filePath: string): string {
	const ext = filePath.split(".").pop()?.toLowerCase();
	return (ext ? MIME_TYPES[ext] : null) ?? "application/octet-stream";
}

export interface StaticOptions {
	assets?: string;
	prefix?: string;
	/** `Cache-Control` for matched assets. */
	cacheControl?: string;
	/** Append `immutable` for fingerprinted assets. */
	immutable?: boolean;
	/** Enable `Accept-Ranges: bytes` for Bun.file streaming. */
	rangeRequests?: boolean;
}

export function resolveSafePath(
	assetsRoot: string,
	filePath: string,
): string | null {
	const resolved = resolve(assetsRoot, filePath);
	if (resolved === assetsRoot) return resolved;
	const prefix = assetsRoot.endsWith(sep) ? assetsRoot : `${assetsRoot}${sep}`;
	if (!resolved.startsWith(prefix)) return null;
	return resolved;
}

export const staticPlugin = definePluginWithOptionalOptions<StaticOptions>(
	{ name: "@ogerjs/static" },
	(app, options) => {
		const assets = options.assets ?? "./public";
		const prefix = options.prefix ?? "/";
		const assetsRoot = resolve(process.cwd(), assets);

		return app.get(`${prefix}*`, async ({ request }) => {
			const url = new URL(request.url);
			let filePath = url.pathname.slice(prefix.length - 1) || "/index.html";
			if (filePath.startsWith("/")) filePath = filePath.slice(1);

			const normalized = normalizeRelativePath(filePath);
			if (normalized === null) {
				return new Response("Not Found", { status: 404 });
			}

			const full = resolveSafePath(assetsRoot, normalized);
			if (!full) {
				return new Response("Not Found", { status: 404 });
			}

			let fileExists = false;
			let fileSize = 0;
			let fileLastModified = 0;
			let fileBody: any = null;

			if (typeof Bun !== "undefined") {
				const file = Bun.file(full);
				fileExists = await file.exists();
				if (fileExists) {
					fileSize = file.size;
					fileLastModified = file.lastModified;
					fileBody = file;
				}
			} else {
				try {
					const stat = await fs.promises.stat(full);
					if (stat.isFile()) {
						fileExists = true;
						fileSize = stat.size;
						fileLastModified = Math.floor(stat.mtimeMs);
						fileBody = Readable.toWeb(fs.createReadStream(full));
					}
				} catch {
					fileExists = false;
				}
			}

			if (!fileExists) {
				return new Response("Not Found", { status: 404 });
			}

			const headers: Record<string, string> = {};
			if (options.cacheControl) {
				headers["cache-control"] = options.immutable
					? `${options.cacheControl}, immutable`
					: options.cacheControl;
			}
			if (options.rangeRequests) {
				headers["accept-ranges"] = "bytes";
			}

			const etag =
				fileSize > 0 ? `W/"${fileSize}-${fileLastModified}"` : undefined;
			if (etag) headers.etag = etag;

			if (typeof Bun === "undefined") {
				headers["content-type"] = getMimeType(full);
			}

			const ifNoneMatch = request.headers.get("if-none-match");
			if (etag && ifNoneMatch === etag) {
				return new Response(null, { status: 304, headers });
			}

			return new Response(fileBody, { headers });
		});
	},
	{},
);

/** @deprecated Use `staticPlugin` */
export { staticPlugin as static };
