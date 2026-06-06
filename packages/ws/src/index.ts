import type { ServerWebSocket } from "bun";
import type { WebSocketHandlers } from "./router";

export type { WebSocketHandlers } from "./router";

export interface WebSocketRouteOptions<Data = unknown> {
	/** Subprotocols advertised during upgrade. */
	protocols?: string[];
	handlers: WebSocketHandlers<Data>;
}

/**
 * Bun `websocket` handlers for `Bun.serve({ fetch, websocket })`.
 * Pair with an HTTP upgrade route that returns `upgradeWebSocket(req)`.
 */
export function createWebSocketHandlers<Data = unknown>(
	options: WebSocketRouteOptions<Data>,
): {
	open: (ws: ServerWebSocket<Data>) => void;
	message: (ws: ServerWebSocket<Data>, message: string | Buffer) => void;
	close: (ws: ServerWebSocket<Data>, code: number, reason: string) => void;
	drain?: (ws: ServerWebSocket<Data>) => void;
} {
	return {
		open(ws) {
			options.handlers.open?.(ws);
		},
		message(ws, message) {
			options.handlers.message?.(ws, message);
		},
		close(ws, code, reason) {
			options.handlers.close?.(ws, code, reason);
		},
		drain: options.handlers.drain,
	};
}

export {
	createWebSocketRouter,
	matchWebSocketRoute,
	type TopicMessage,
	TopicPubSub,
	type WebSocketRoute,
	type WebSocketRouterOptions,
} from "./router";

/** Scaffold: generate client types from server route contracts (implement in Phase 3). */
export interface WebSocketClientContract {
	routes: Array<{ path: string; messageTypes?: string[] }>;
}

export function scaffoldWebSocketClient(_contract: WebSocketClientContract): {
	readonly kind: "scaffold";
} {
	return { kind: "scaffold" };
}

/** Returns a 426 response when the request is not a WebSocket upgrade. */
export function requireWebSocketUpgrade(request: Request): Response | null {
	const upgrade = request.headers.get("upgrade");
	if (upgrade?.toLowerCase() !== "websocket") {
		return Response.json(
			{ error: "Expected WebSocket upgrade" },
			{ status: 426 },
		);
	}
	return null;
}
