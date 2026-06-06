import {
	definePlugin,
	type OfficialPluginMeta,
	type OgerPlugin,
} from "./define-plugin";
import type { MacroDefinition } from "./macro";
import type { Oger } from "./oger";
import type { Context } from "./types";

/** Result merged onto the request context when auth succeeds. */
export type AuthResolveResult = Record<string, unknown>;

/**
 * Validates the request and returns context to merge, or a `Response` to short-circuit.
 * Use with `defineAuthPlugin` for external session/OIDC providers.
 */
export type AuthResolveFn = (
	ctx: Context,
) => AuthResolveResult | Response | Promise<AuthResolveResult | Response>;

export interface AuthPluginSetup {
	/** Route macro flag name. Default: `auth`. */
	macroName?: string;
	resolve: AuthResolveFn;
	decorate?: Record<string, unknown>;
	/** Extra macro fields (schemas, beforeHandle, etc.). */
	macro?: Omit<MacroDefinition, "resolve">;
}

/**
 * Standard auth plugin factory: registers a macro that runs `resolve` on protected routes.
 *
 * @example
 * ```ts
 * const sessionAuth = defineAuthPlugin({ name: "@myapp/session-auth" }, () => ({
 *   resolve: async (ctx) => {
 *     const user = await loadUser(ctx.cookie.session?.value);
 *     if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
 *     return { user };
 *   },
 * }));
 * app.use(sessionAuth()).get("/me", ({ user }) => user, { auth: true });
 * ```
 */
export function defineAuthPlugin(
	meta: OfficialPluginMeta,
	setup: (app: Oger) => AuthPluginSetup,
): () => OgerPlugin {
	return definePlugin(meta, (app) => {
		const {
			macroName = "auth",
			resolve,
			decorate,
			macro: macroExtra,
		} = setup(app);
		let instance = app;
		if (decorate) instance = instance.decorate(decorate);
		const macroDef: MacroDefinition = {
			...macroExtra,
			resolve,
		};
		return instance.macro({ [macroName]: macroDef });
	});
}
