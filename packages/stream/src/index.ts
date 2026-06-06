import fs from "node:fs";
import { Readable } from "node:stream";

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

/** Stream a file (path or Blob) with optional content type. */
export function streamFile(
	file: string | Blob,
	init: {
		status?: number;
		headers?: Record<string, string>;
		contentType?: string;
	} = {},
): Response {
	const headers = new Headers(init.headers);
	let body: any;
	let inferredContentType = init.contentType;

	if (typeof file === "string") {
		if (typeof Bun !== "undefined") {
			const bunFile = Bun.file(file);
			body = bunFile.stream();
			if (!inferredContentType) {
				inferredContentType = bunFile.type;
			}
		} else {
			body = Readable.toWeb(fs.createReadStream(file));
			if (!inferredContentType) {
				inferredContentType = getMimeType(file);
			}
		}
	} else if (file instanceof Blob) {
		body = file.stream();
		if (!inferredContentType) {
			inferredContentType = file.type;
		}
	} else {
		throw new Error("Unsupported file type for streamFile");
	}

	if (inferredContentType) {
		headers.set("content-type", inferredContentType);
	}

	return new Response(body, { status: init.status, headers });
}

/** Newline-delimited JSON stream. */
export function streamJsonLines<T>(
	items: AsyncIterable<T> | Iterable<T>,
	init: { status?: number; headers?: Record<string, string> } = {},
): Response {
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			for await (const item of items) {
				controller.enqueue(encoder.encode(`${JSON.stringify(item)}\n`));
			}
			controller.close();
		},
	});
	const headers = new Headers(init.headers);
	headers.set("content-type", "application/x-ndjson; charset=utf-8");
	return new Response(stream, { status: init.status, headers });
}

/** CSV rows as a streaming response (header row optional). */
export function streamCsv(
	rows: AsyncIterable<string[]> | Iterable<string[]>,
	options: { header?: string[] } = {},
): Response {
	const encoder = new TextEncoder();
	const escapeCsv = (cell: string) =>
		cell.includes(",") || cell.includes('"')
			? `"${cell.replace(/"/g, '""')}"`
			: cell;

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			if (options.header?.length) {
				controller.enqueue(
					encoder.encode(`${options.header.map(escapeCsv).join(",")}\n`),
				);
			}
			for await (const row of rows) {
				controller.enqueue(encoder.encode(`${row.map(escapeCsv).join(",")}\n`));
			}
			controller.close();
		},
	});

	return new Response(stream, {
		headers: { "content-type": "text/csv; charset=utf-8" },
	});
}

/** Plain text line stream (logs, exports). */
export function streamLines(
	lines: AsyncIterable<string> | Iterable<string>,
): Response {
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			for await (const line of lines) {
				controller.enqueue(encoder.encode(`${line}\n`));
			}
			controller.close();
		},
	});
	return new Response(stream, {
		headers: { "content-type": "text/plain; charset=utf-8" },
	});
}
