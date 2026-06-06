import {
	internalErrorProblem,
	type ProblemDetails,
	problemDetailsResponse,
} from "./problem";

export class OgerError extends Error {
	constructor(
		message: string,
		public readonly status = 500,
		public readonly code = "INTERNAL_ERROR",
		public readonly details?: unknown,
		public readonly type?: string,
	) {
		super(message);
		this.name = "OgerError";
	}
}

export function status(code: number, message?: string): never {
	throw new OgerError(message ?? `HTTP ${code}`, code, "HTTP_ERROR");
}

export interface ValidationIssue {
	type: string;
	property: string;
	message: string;
	expected?: string;
}

export class ValidationError extends OgerError {
	constructor(public readonly issues: ValidationIssue[]) {
		super("Validation failed", 422, "VALIDATION_ERROR", { issues });
		this.name = "ValidationError";
	}
}

function includeDetailsInProduction(): boolean {
	return process.env.NODE_ENV !== "production";
}

export function toProblemDetails(
	err: OgerError,
	instance?: string,
): ProblemDetails {
	const problem: ProblemDetails = {
		type: err.type ?? problemTypeForCode(err.code, err.status),
		title: err.name === "ValidationError" ? "Validation failed" : err.message,
		status: err.status,
		detail: err.message,
		code: err.code,
	};
	if (includeDetailsInProduction() && err.details !== undefined) {
		problem.errors = err.details;
	}
	if (instance) problem.instance = instance;
	return problem;
}

function problemTypeForCode(code: string, status: number): string {
	return `urn:ogerjs:problem:${code.toLowerCase()}:${status}`;
}

export function validationResponse(
	issues: ValidationIssue[],
	instance?: string,
): Response {
	const problem: ProblemDetails = {
		type: problemTypeForCode("VALIDATION_ERROR", 422),
		title: "Validation failed",
		status: 422,
		detail: "One or more fields failed validation.",
		code: "VALIDATION_ERROR",
		issues,
	};
	if (instance) problem.instance = instance;
	return problemDetailsResponse(problem);
}

/** RFC 7807 response for `OgerError` and subclasses. */
export function ogerErrorResponse(err: OgerError, instance?: string): Response {
	return problemDetailsResponse(toProblemDetails(err, instance));
}

/** @deprecated Alias — use `ogerErrorResponse`. */
export const legacyErrorResponse = ogerErrorResponse;

export function errorToResponse(err: unknown, instance?: string): Response {
	if (err instanceof ValidationError)
		return validationResponse(err.issues, instance);
	if (err instanceof OgerError) return ogerErrorResponse(err, instance);
	if (err instanceof Error) {
		return problemDetailsResponse(
			{
				type: "about:blank",
				title: err.name || "Error",
				status: 500,
				detail: includeDetailsInProduction()
					? err.message
					: "Internal server error",
				code: "INTERNAL_ERROR",
			},
			{ instance },
		);
	}
	return internalErrorProblem();
}
