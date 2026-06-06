import type { CorsOptions } from "./index";

export interface CorsPolicyOptions extends CorsOptions {
	/** When true, apply stricter defaults and emit warnings for unsafe combos. */
	production?: boolean;
}

export interface CorsPolicyWarning {
	code: string;
	message: string;
}

/**
 * Build CORS options with production-safe defaults.
 * `origin` defaults to explicit allow-list required when `credentials` is true.
 */
export function buildCorsPolicy(options: CorsPolicyOptions = {}): CorsOptions {
	const production =
		options.production ?? process.env.NODE_ENV === "production";

	if (production) {
		return {
			origin: options.origin ?? false,
			methods: options.methods ?? [
				"GET",
				"POST",
				"PUT",
				"PATCH",
				"DELETE",
				"OPTIONS",
			],
			allowedHeaders: options.allowedHeaders ?? [
				"content-type",
				"authorization",
			],
			credentials: options.credentials ?? false,
		};
	}

	return {
		origin: options.origin ?? "*",
		methods: options.methods,
		allowedHeaders: options.allowedHeaders,
		credentials: options.credentials ?? false,
	};
}

/** Returns non-fatal warnings for risky CORS configuration. */
export function validateCorsPolicy(options: CorsOptions): CorsPolicyWarning[] {
	const warnings: CorsPolicyWarning[] = [];
	const credentials = options.credentials ?? false;

	if (credentials && (options.origin === "*" || options.origin === undefined)) {
		warnings.push({
			code: "cors_credentials_wildcard",
			message:
				"credentials: true cannot be used with origin '*' — browsers will reject it",
		});
	}

	if (options.origin === true) {
		warnings.push({
			code: "cors_reflect_origin",
			message: "origin: true reflects any Origin — restrict in production",
		});
	}

	if (!options.allowedHeaders?.length) {
		warnings.push({
			code: "cors_default_headers",
			message:
				"using default allowed headers only; add custom headers explicitly if needed",
		});
	}

	return warnings;
}
