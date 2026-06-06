export type Token<_T = unknown> = symbol | string;

export type ProviderScope = "singleton" | "transient" | "request";

export interface RegisterOptions {
	scope?: ProviderScope;
}

export interface Container {
	register<T>(token: Token<T>, value: T, options?: RegisterOptions): void;
	registerFactory<T>(
		token: Token<T>,
		factory: (container: Container) => T,
		options?: RegisterOptions,
	): void;
	resolve<T>(token: Token<T>): T;
	has(token: Token): boolean;
	/** Replace a registration (primarily for tests). */
	override<T>(token: Token<T>, value: T): void;
	/** Fork container for per-request scope (inherits singletons). */
	createRequestScope(): Container;
}

type Entry =
	| { kind: "value"; value: unknown; scope: ProviderScope }
	| {
			kind: "factory";
			factory: (container: Container) => unknown;
			scope: ProviderScope;
	  };

function createContainerInternal(parent?: Container): Container {
	const entries = new Map<Token, Entry>();
	const resolving = new Set<Token>();
	const overrides = new Map<Token, unknown>();

	const container: Container = {
		register(token, value, options) {
			entries.set(token, {
				kind: "value",
				value,
				scope: options?.scope ?? "singleton",
			});
			overrides.delete(token);
		},
		registerFactory(token, factory, options) {
			entries.set(token, {
				kind: "factory",
				factory,
				scope: options?.scope ?? "singleton",
			});
			overrides.delete(token);
		},
		has(token) {
			return overrides.has(token) || entries.has(token);
		},
		override(token, value) {
			overrides.set(token, value);
		},
		resolve(token) {
			if (overrides.has(token)) return overrides.get(token) as never;

			const entry = entries.get(token);
			if (!entry) {
				if (parent?.has(token)) return parent.resolve(token);
				const label =
					typeof token === "symbol"
						? (token.description ?? "symbol")
						: String(token);
				throw new Error(`DI: token not registered (${label})`);
			}

			if (entry.kind === "value") {
				if (entry.scope === "request" && parent) return entry.value as never;
				return entry.value as never;
			}

			if (entry.scope === "transient") {
				return entry.factory(container) as never;
			}

			if (resolving.has(token)) {
				throw new Error("DI: circular dependency detected");
			}
			resolving.add(token);
			try {
				const value = entry.factory(container);
				if (entry.scope === "singleton") {
					entries.set(token, { kind: "value", value, scope: "singleton" });
				}
				return value as never;
			} finally {
				resolving.delete(token);
			}
		},
		createRequestScope() {
			const child = createContainerInternal(container);
			for (const [token, entry] of entries) {
				if (entry.scope === "request") continue;
				if (entry.kind === "value")
					child.register(token, entry.value, { scope: entry.scope });
				else
					child.registerFactory(token, entry.factory, { scope: entry.scope });
			}
			return child;
		},
	};

	return container;
}

export function createContainer(): Container {
	return createContainerInternal();
}

/** Test harness container with optional overrides applied before resolve. */
export function createTestContainer(
	overrides?: Record<Token, unknown>,
): Container {
	const c = createContainer();
	if (overrides) {
		for (const [token, value] of Object.entries(overrides)) {
			c.override(token as Token, value);
		}
	}
	return c;
}
