export interface RouteBodyLimitRule {
	/** Path prefix or exact path. */
	path: string;
	maxSize: number;
	/** Optional content-type prefix (e.g. `application/json`). */
	contentType?: string;
	/** When set, rule applies only when this header is present on the request. */
	tenantHeader?: string;
}

export interface ResolvedBodyLimit {
	maxSize: number;
	source: "global" | "route" | "contentType" | "tenant";
}

export function resolveBodyLimit(
	ctx: {
		pathname: string;
		contentType: string | null;
		tenantId?: string;
	},
	globalMax: number,
	rules: RouteBodyLimitRule[] = [],
): ResolvedBodyLimit {
	let best: ResolvedBodyLimit = { maxSize: globalMax, source: "global" };

	for (const rule of rules) {
		const matchesPath =
			ctx.pathname === rule.path ||
			ctx.pathname.startsWith(
				rule.path.endsWith("/") ? rule.path : `${rule.path}/`,
			);
		if (!matchesPath) continue;

		if (rule.tenantHeader && !ctx.tenantId) continue;

		if (rule.contentType) {
			const ct = ctx.contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
			if (!ct.startsWith(rule.contentType.toLowerCase())) continue;
			best = { maxSize: rule.maxSize, source: "contentType" };
			continue;
		}

		if (rule.tenantHeader && ctx.tenantId) {
			best = { maxSize: rule.maxSize, source: "tenant" };
			continue;
		}

		best = { maxSize: rule.maxSize, source: "route" };
	}

	return best;
}
