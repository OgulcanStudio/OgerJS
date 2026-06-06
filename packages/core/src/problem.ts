/** RFC 7807 `application/problem+json` helpers (default enterprise error shape). */

export const PROBLEM_JSON = "application/problem+json";

export interface ProblemDetails {
	type?: string;
	title: string;
	status: number;
	detail?: string;
	instance?: string;
	[extension: string]: unknown;
}

export interface ProblemResponseOptions {
	instance?: string;
	extensions?: Record<string, unknown>;
}

export function problemDetailsResponse(
	problem: ProblemDetails,
	options: ProblemResponseOptions = {},
): Response {
	const body: ProblemDetails = { ...problem, ...options.extensions };
	if (options.instance) body.instance = options.instance;
	return Response.json(body, {
		status: problem.status,
		headers: { "content-type": PROBLEM_JSON },
	});
}

const NOT_FOUND_PROBLEM: ProblemDetails = {
	type: "about:blank",
	title: "Not Found",
	status: 404,
	detail: "No route matches the request path.",
	code: "NOT_FOUND",
};

/** Pre-serialized 404 body — avoids per-request `Response.json` on unmatched routes. */
const NOT_FOUND_BODY = JSON.stringify(NOT_FOUND_PROBLEM);

const NOT_FOUND_INIT: ResponseInit = {
	status: 404,
	headers: { "content-type": PROBLEM_JSON },
};

export function notFoundProblem(instance?: string): Response {
	if (!instance) {
		return new Response(NOT_FOUND_BODY, NOT_FOUND_INIT);
	}
	return problemDetailsResponse(NOT_FOUND_PROBLEM, { instance });
}

export function internalErrorProblem(
	detail = "An unexpected error occurred.",
): Response {
	return problemDetailsResponse({
		type: "about:blank",
		title: "Internal Server Error",
		status: 500,
		detail,
		code: "INTERNAL_ERROR",
	});
}
