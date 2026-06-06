import type { RouteRegistry } from "@ogerjs/core";

/** Minimal OpenAPI 3.0 snapshot from compile-time route registry. */
export function registryToOpenApi(
	registry: RouteRegistry,
	info: { title: string; version: string },
): Record<string, unknown> {
	const paths: Record<string, Record<string, unknown>> = {};

	for (const route of registry.entries) {
		const pathItem = paths[route.path] ?? (paths[route.path] = {});
		const operation: Record<string, unknown> = {
			operationId: `${route.method.toLowerCase()}${route.path.replace(/[/:{}]/g, "_")}`,
			summary: route.meta?.summary,
			description: route.meta?.description,
			tags: route.meta?.tags,
			deprecated: route.meta?.deprecated,
		};

		if (route.meta?.security) {
			operation.security = route.meta.security;
		}

		if (route.schema?.body) {
			operation.requestBody = {
				required: true,
				content: { "application/json": { schema: { type: "object" } } },
			};
		}

		if (route.schema?.response) {
			operation.responses = {
				"200": {
					description: "Success",
					content: { "application/json": { schema: { type: "object" } } },
				},
			};
		} else {
			operation.responses = { "200": { description: "Success" } };
		}

		pathItem[route.method.toLowerCase()] = operation;
	}

	return {
		openapi: "3.0.3",
		info,
		paths,
		components: {
			securitySchemes: {
				bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
			},
		},
	};
}
