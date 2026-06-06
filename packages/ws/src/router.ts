import type { ServerWebSocket } from "bun";

export interface WebSocketHandlers<Data = unknown> {
	open?: (ws: ServerWebSocket<Data>) => void;
	message?: (ws: ServerWebSocket<Data>, message: string | Buffer) => void;
	close?: (ws: ServerWebSocket<Data>, code: number, reason: string) => void;
	drain?: (ws: ServerWebSocket<Data>) => void;
}

export interface WebSocketRoute<
	Params extends Record<string, string> = Record<string, string>,
> {
	path: string;
	handlers: WebSocketHandlers<{ params: Params; data?: unknown }>;
	protocols?: string[];
}

export interface WebSocketRouterOptions {
	routes: WebSocketRoute[];
}

/** Match pathname to a registered WebSocket route (supports `:param` segments). */
export function matchWebSocketRoute(
	pathname: string,
	routes: WebSocketRoute[],
): { route: WebSocketRoute; params: Record<string, string> } | null {
	for (const route of routes) {
		const params = matchPath(route.path, pathname);
		if (params) return { route, params };
	}
	return null;
}

function matchPath(
	pattern: string,
	pathname: string,
): Record<string, string> | null {
	const patternParts = pattern.split("/").filter(Boolean);
	const pathParts = pathname.split("/").filter(Boolean);
	if (patternParts.length !== pathParts.length) return null;

	const params: Record<string, string> = {};
	for (let i = 0; i < patternParts.length; i++) {
		const pp = patternParts[i]!;
		const part = pathParts[i]!;
		if (pp.startsWith(":")) {
			params[pp.slice(1)] = decodeURIComponent(part);
		} else if (pp !== part) {
			return null;
		}
	}
	return params;
}

/** Build Bun websocket handlers map keyed by route path. */
export function createWebSocketRouter(options: WebSocketRouterOptions): {
	match: (pathname: string) => ReturnType<typeof matchWebSocketRoute>;
	handlersFor: (route: WebSocketRoute) => WebSocketHandlers<unknown>;
} {
	return {
		match: (pathname) => matchWebSocketRoute(pathname, options.routes),
		handlersFor: (route) => route.handlers as WebSocketHandlers<unknown>,
	};
}

export type TopicMessage = { topic: string; data: string };

/** In-process topic pub/sub for Bun WebSocket servers. */
export class TopicPubSub<Data = unknown> {
	private readonly subscribers = new Map<string, Set<ServerWebSocket<Data>>>();

	subscribe(topic: string, ws: ServerWebSocket<Data>): void {
		let set = this.subscribers.get(topic);
		if (!set) {
			set = new Set();
			this.subscribers.set(topic, set);
		}
		set.add(ws);
	}

	unsubscribe(topic: string, ws: ServerWebSocket<Data>): void {
		this.subscribers.get(topic)?.delete(ws);
	}

	unsubscribeAll(ws: ServerWebSocket<Data>): void {
		for (const set of this.subscribers.values()) set.delete(ws);
	}

	publish(topic: string, message: string | ArrayBuffer): number {
		const set = this.subscribers.get(topic);
		if (!set) return 0;
		let sent = 0;
		for (const ws of set) {
			ws.send(message);
			sent += 1;
		}
		return sent;
	}

	subscriberCount(topic: string): number {
		return this.subscribers.get(topic)?.size ?? 0;
	}
}
