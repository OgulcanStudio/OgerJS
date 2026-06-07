export class TrieNode<T> {
	children: Map<string, TrieNode<T>> | null = null;
	paramChild: TrieNode<T> | null = null;
	paramName: string | null = null;
	wildcardChild: TrieNode<T> | null = null;

	getHandler: T | null = null;
	postHandler: T | null = null;
	putHandler: T | null = null;
	deleteHandler: T | null = null;
	otherHandlers: Map<string, T> | null = null;

	setHandler(method: string, handler: T) {
		const m = method.toUpperCase();
		if (m === "ALL") {
			if (!this.getHandler) this.getHandler = handler;
			if (!this.postHandler) this.postHandler = handler;
			if (!this.putHandler) this.putHandler = handler;
			if (!this.deleteHandler) this.deleteHandler = handler;

			if (!this.otherHandlers) this.otherHandlers = new Map();
			this.otherHandlers.set("ALL", handler);
		} else {
			if (m === "GET") this.getHandler = handler;
			else if (m === "POST") this.postHandler = handler;
			else if (m === "PUT") this.putHandler = handler;
			else if (m === "DELETE") this.deleteHandler = handler;

			if (!this.otherHandlers) this.otherHandlers = new Map();
			this.otherHandlers.set(method, handler);
			this.otherHandlers.set(m, handler);
		}
	}

	getHandlerFor(method: string): T | null {
		const m = method.toUpperCase();
		let handler: T | null = null;

		if (m === "GET") handler = this.getHandler;
		else if (m === "POST") handler = this.postHandler;
		else if (m === "PUT") handler = this.putHandler;
		else if (m === "DELETE") handler = this.deleteHandler;
		else if (this.otherHandlers) {
			handler = this.otherHandlers.get(method) || this.otherHandlers.get(m) || null;
		}

		if (handler) return handler;

		if (this.otherHandlers) {
			return this.otherHandlers.get("ALL") || null;
		}

		return null;
	}
}

export function normalizePath(path: string): string {
	if (path === "/" || path === "") return "/";

	// Fast path: avoid string operations/RegExp if path is already normalized
	if (
		path.charCodeAt(0) === 47 &&
		path.charCodeAt(path.length - 1) !== 47 &&
		!path.includes("//")
	) {
		return path;
	}

	let res = path;
	if (!res.startsWith("/")) {
		res = `/${res}`;
	}
	res = res.replace(/\/+/g, "/");
	if (res.endsWith("/") && res.length > 1) {
		res = res.slice(0, -1);
	}
	return res;
}

const EMPTY_PARAMS: Record<string, string> = Object.freeze({});
const sharedParamValues: string[] = [];

export class Router<T> {
	private staticRoutes: Record<string, Record<string, T>> = Object.create(null);
	root = new TrieNode<T>();
	private hasDynamic = false;
	private cache = new Map<string, { handler: T; params: Record<string, string> } | null>();

	add(method: string, path: string, handler: T) {
		this.cache.clear();
		const normPath = normalizePath(path);
		const isDynamic = normPath.includes(":") || normPath.includes("*");

		if (!isDynamic) {
			const m = method.toUpperCase();
			let methodMap = this.staticRoutes[m];
			if (!methodMap) {
				methodMap = Object.create(null);
				this.staticRoutes[m] = methodMap;
			}
			methodMap[normPath] = handler;

			if (m === "ALL") {
				let allMap = this.staticRoutes["ALL"];
				if (!allMap) {
					allMap = Object.create(null);
					this.staticRoutes["ALL"] = allMap;
				}
				allMap[normPath] = handler;
			}
		} else {
			this.hasDynamic = true;
		}

		const parts = normPath.split("/").filter(Boolean);
		let current = this.root;

		for (const part of parts) {
			if (part === "*") {
				if (!current.wildcardChild) {
					current.wildcardChild = new TrieNode<T>();
				}
				current = current.wildcardChild;
			} else if (part.startsWith(":")) {
				const paramName = part.slice(1);
				if (!current.paramChild) {
					current.paramChild = new TrieNode<T>();
					current.paramName = paramName;
				}
				current = current.paramChild;
			} else {
				if (!current.children) {
					current.children = new Map();
				}
				let next = current.children.get(part);
				if (!next) {
					next = new TrieNode<T>();
					current.children.set(part, next);
				}
				current = next;
			}
		}

		current.setHandler(method, handler);
	}

	find(
		method: string,
		path: string,
	): { handler: T; params: Record<string, string> } | null {
		const cacheKey = `${method}:${path}`;
		const cached = this.cache.get(cacheKey);
		if (cached !== undefined) return cached;

		// 1. Fast static lookup for exact matches (bypasses casing/normalization checks)
		const methodMap = this.staticRoutes[method];
		if (methodMap) {
			const staticHandler = methodMap[path];
			if (staticHandler) {
				const result = { handler: staticHandler, params: EMPTY_PARAMS };
				if (this.cache.size < 2000) this.cache.set(cacheKey, result);
				return result;
			}
		}

		let m = method;
		if (method !== "GET" && method !== "POST" && method !== "PUT" && method !== "DELETE") {
			m = method.toUpperCase();
		}

		let mMap = this.staticRoutes[m];
		let staticHandler = mMap ? mMap[path] : undefined;
		if (!staticHandler) {
			staticHandler = this.staticRoutes["ALL"]?.[path];
		}
		if (staticHandler) {
			const result = { handler: staticHandler, params: EMPTY_PARAMS };
			if (this.cache.size < 2000) this.cache.set(cacheKey, result);
			return result;
		}

		const normPath = normalizePath(path);
		if (normPath !== path) {
			mMap = this.staticRoutes[m];
			staticHandler = mMap ? mMap[normPath] : undefined;
			if (!staticHandler) {
				staticHandler = this.staticRoutes["ALL"]?.[normPath];
			}
			if (staticHandler) {
				const result = { handler: staticHandler, params: EMPTY_PARAMS };
				if (this.cache.size < 2000) this.cache.set(cacheKey, result);
				return result;
			}
		}

		if (!this.hasDynamic) {
			if (this.cache.size < 2000) this.cache.set(cacheKey, null);
			return null;
		}

		// 2. Trie lookup for dynamic routes
		let start = 0;
		while (start < normPath.length && normPath.charCodeAt(start) === 47) {
			start++;
		}

		sharedParamValues.length = 0;
		const handler = this.match(this.root, normPath, start, m, sharedParamValues);
		if (handler) {
			const params: Record<string, string> = Object.create(null);
			for (let i = 0; i < sharedParamValues.length; i += 2) {
				params[sharedParamValues[i]] = sharedParamValues[i + 1];
			}
			const result = { handler, params };
			if (this.cache.size < 2000) this.cache.set(cacheKey, result);
			return result;
		}

		if (this.cache.size < 2000) this.cache.set(cacheKey, null);
		return null;
	}

	private match(
		node: TrieNode<T>,
		path: string,
		start: number,
		method: string,
		paramValues: string[],
	): T | null {
		while (start < path.length && path.charCodeAt(start) === 47) {
			start++;
		}

		if (start >= path.length) {
			const handler = node.getHandlerFor(method);
			if (handler) return handler;

			if (node.wildcardChild) {
				const wildcardHandler = node.wildcardChild.getHandlerFor(method);
				if (wildcardHandler) {
					paramValues.push("*", "");
					return wildcardHandler;
				}
			}
			return null;
		}

		let end = start;
		while (end < path.length && path.charCodeAt(end) !== 47) {
			end++;
		}

		const segment = path.slice(start, end);

		// 1. Try static matches first (highest precedence)
		if (node.children) {
			const nextNode = node.children.get(segment);
			if (nextNode) {
				const handler = this.match(nextNode, path, end, method, paramValues);
				if (handler) return handler;
			}
		}

		// 2. Try parameterized path matches (second precedence)
		if (node.paramChild) {
			const paramLength = paramValues.length;
			const handler = this.match(node.paramChild, path, end, method, paramValues);
			if (handler) {
				paramValues.push(node.paramName!, segment);
				return handler;
			}
			paramValues.length = paramLength; // Backtrack
		}

		// 3. Try wildcard matches (lowest precedence)
		if (node.wildcardChild) {
			const wildcardHandler = node.wildcardChild.getHandlerFor(method);
			if (wildcardHandler) {
				paramValues.push("*", path.slice(start));
				return wildcardHandler;
			}
		}

		return null;
	}
}
