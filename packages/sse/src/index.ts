import type { RouteHandler } from "@ogerjs/core";
import { definePluginWithOptionalOptions } from "@ogerjs/core";

export type SseSend = (event: string, data: unknown, id?: string) => void;

export interface SseStreamOptions {
	headers?: Record<string, string>;
}

/** Create a Server-Sent Events `Response` from an async event producer. */
export function createSseResponse(
	producer: (send: SseSend, signal: AbortSignal) => void | Promise<void>,
	options: SseStreamOptions = {},
): Response {
	const encoder = new TextEncoder();
	let closed = false;

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const send: SseSend = (event, data, id) => {
				if (closed) return;
				let chunk = "";
				if (id) chunk += `id: ${id}\n`;
				if (event) chunk += `event: ${event}\n`;
				const payload = typeof data === "string" ? data : JSON.stringify(data);
				for (const line of payload.split("\n")) {
					chunk += `data: ${line}\n`;
				}
				chunk += "\n";
				controller.enqueue(encoder.encode(chunk));
			};

			const ac = new AbortController();
			try {
				await producer(send, ac.signal);
			} finally {
				closed = true;
				controller.close();
			}
		},
		cancel() {
			closed = true;
		},
	});

	return new Response(stream, {
		headers: {
			"content-type": "text/event-stream; charset=utf-8",
			"cache-control": "no-cache",
			connection: "keep-alive",
			...options.headers,
		},
	});
}

export interface SsePluginOptions {
	/** Default route path when using `sseRoute`. */
	path?: string;
}

/** Wrap a handler that returns an SSE stream response. */
export function sseHandler(
	producer: (send: SseSend, signal: AbortSignal) => void | Promise<void>,
): RouteHandler {
	return () => createSseResponse(producer);
}

export const sse = definePluginWithOptionalOptions<SsePluginOptions>(
	{ name: "@ogerjs/sse" },
	(app) => app,
	{},
);
