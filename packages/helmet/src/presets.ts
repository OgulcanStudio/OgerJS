import type { HelmetOptions } from "./index";

/** JSON APIs — minimal surface, no framing. */
export const helmetApiPreset = (): HelmetOptions => ({
	contentSecurityPolicy: false,
	crossOriginEmbedderPolicy: false,
	crossOriginOpenerPolicy: "same-origin",
	crossOriginResourcePolicy: "same-origin",
	referrerPolicy: "no-referrer",
	xContentTypeOptions: "nosniff",
	xFrameOptions: "DENY",
	xDnsPrefetchControl: "off",
});

/** SPA dashboards — allow inline for bundled assets. */
export const helmetDashboardPreset = (): HelmetOptions => ({
	contentSecurityPolicy:
		"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'",
	crossOriginEmbedderPolicy: false,
	crossOriginOpenerPolicy: "same-origin",
	crossOriginResourcePolicy: "same-site",
	referrerPolicy: "strict-origin-when-cross-origin",
	xContentTypeOptions: "nosniff",
	xFrameOptions: "SAMEORIGIN",
});

/** Admin consoles — stricter framing and CORP. */
export const helmetAdminPreset = (): HelmetOptions => ({
	contentSecurityPolicy: "default-src 'self'; frame-ancestors 'none'",
	crossOriginEmbedderPolicy: "require-corp",
	crossOriginOpenerPolicy: "same-origin",
	crossOriginResourcePolicy: "same-origin",
	referrerPolicy: "no-referrer",
	strictTransportSecurity: "max-age=31536000; includeSubDomains",
	xContentTypeOptions: "nosniff",
	xFrameOptions: "DENY",
	xDnsPrefetchControl: "off",
});

/** Public marketing sites — permissive images/fonts. */
export const helmetPublicWebsitePreset = (): HelmetOptions => ({
	contentSecurityPolicy:
		"default-src 'self'; img-src 'self' https: data:; font-src 'self' https: data:; style-src 'self' 'unsafe-inline' https:",
	crossOriginEmbedderPolicy: false,
	crossOriginOpenerPolicy: "same-origin",
	crossOriginResourcePolicy: "cross-origin",
	referrerPolicy: "strict-origin-when-cross-origin",
	xContentTypeOptions: "nosniff",
	xFrameOptions: "SAMEORIGIN",
});
