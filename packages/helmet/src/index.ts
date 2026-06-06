import { definePluginWithOptionalOptions } from "@ogerjs/core";

export interface HelmetOptions {
	contentSecurityPolicy?: string | false;
	crossOriginEmbedderPolicy?: string | false;
	crossOriginOpenerPolicy?: string | false;
	crossOriginResourcePolicy?: string | false;
	referrerPolicy?: string | false;
	strictTransportSecurity?: string | false;
	xContentTypeOptions?: string | false;
	xFrameOptions?: string | false;
	xDnsPrefetchControl?: string | false;
}

const DEFAULTS: Required<Omit<HelmetOptions, never>> = {
	contentSecurityPolicy: "default-src 'self'",
	crossOriginEmbedderPolicy: "require-corp",
	crossOriginOpenerPolicy: "same-origin",
	crossOriginResourcePolicy: "same-origin",
	referrerPolicy: "no-referrer",
	strictTransportSecurity: false,
	xContentTypeOptions: "nosniff",
	xFrameOptions: "SAMEORIGIN",
	xDnsPrefetchControl: "off",
};

const PRODUCTION_HSTS = "max-age=15552000; includeSubDomains";

const HEADER_MAP: Record<keyof typeof DEFAULTS, string> = {
	contentSecurityPolicy: "Content-Security-Policy",
	crossOriginEmbedderPolicy: "Cross-Origin-Embedder-Policy",
	crossOriginOpenerPolicy: "Cross-Origin-Opener-Policy",
	crossOriginResourcePolicy: "Cross-Origin-Resource-Policy",
	referrerPolicy: "Referrer-Policy",
	strictTransportSecurity: "Strict-Transport-Security",
	xContentTypeOptions: "X-Content-Type-Options",
	xFrameOptions: "X-Frame-Options",
	xDnsPrefetchControl: "X-DNS-Prefetch-Control",
};

export {
	helmetAdminPreset,
	helmetApiPreset,
	helmetDashboardPreset,
	helmetPublicWebsitePreset,
} from "./presets";

export const helmet = definePluginWithOptionalOptions<HelmetOptions>(
	{ name: "@ogerjs/helmet", scope: "global" },
	(app, options) =>
		app.onRequest((ctx) => {
			const headers: Record<string, string> = { ...(ctx.set.headers ?? {}) };

			for (const key of Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]) {
				let value = options[key] ?? DEFAULTS[key];
				if (
					key === "strictTransportSecurity" &&
					options.strictTransportSecurity === undefined &&
					process.env.NODE_ENV === "production"
				) {
					value = PRODUCTION_HSTS;
				}
				if (value === false) continue;
				headers[HEADER_MAP[key]] = value;
			}

			ctx.set.headers = headers;
		}),
	{},
);
