import { OgerError } from "./error";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Reject mutating requests whose `Content-Length` exceeds `limit`. */
export function assertMutatingBodyLimit(request: Request, limit: number): void {
	if (!MUTATING_METHODS.has(request.method.toUpperCase())) return;

	let rawLength = (request as { _contentLength?: string | null })._contentLength;
	if (rawLength === undefined) {
		rawLength = request.headers.get("content-length");
		(request as { _contentLength?: string | null })._contentLength = rawLength;
	}
	if (rawLength === null || rawLength === undefined) return;

	const contentLength = Number(rawLength);
	if (!Number.isFinite(contentLength) || contentLength < 0) {
		throw new OgerError(
			"Invalid Content-Length",
			400,
			"INVALID_CONTENT_LENGTH",
		);
	}
	if (contentLength > limit) {
		throw new OgerError("Payload too large", 413, "PAYLOAD_TOO_LARGE");
	}
}

export function isJsonContentType(contentType: string): boolean {
	return contentType.includes("application/json");
}

export function parseJson(text: string): unknown {
	return JSON.parse(text);
}

export function stringifyJson(value: unknown): string {
	return JSON.stringify(value);
}

/** Read request body as text and enforce a byte/char limit. */
export async function readLimitedText(
	request: Request,
	limit: number,
): Promise<string> {
	const text = await request.text();
	if (text.length > limit) {
		throw new OgerError("Payload too large", 413, "PAYLOAD_TOO_LARGE");
	}
	return text;
}

export async function readJsonBody(
	request: Request,
	limit: number,
	contentLength?: number,
): Promise<unknown> {
	if (contentLength === undefined) {
		const cached = (request as { _contentLength?: string | null })._contentLength;
		const rawLength =
			cached !== undefined
				? cached
				: ((request as { _contentLength?: string | null })._contentLength =
						request.headers.get("content-length"));
		if (rawLength != null) {
			const parsed = Number(rawLength);
			if (Number.isFinite(parsed)) {
				if (parsed < 0) {
					throw new OgerError(
						"Invalid Content-Length",
						400,
						"INVALID_CONTENT_LENGTH",
					);
				}
				if (parsed > limit) {
					throw new OgerError("Payload too large", 413, "PAYLOAD_TOO_LARGE");
				}
				contentLength = parsed;
			}
		}
	} else if (contentLength > limit) {
		throw new OgerError("Payload too large", 413, "PAYLOAD_TOO_LARGE");
	}

	const text = await request.text();
	if (text.length > limit) {
		throw new OgerError("Payload too large", 413, "PAYLOAD_TOO_LARGE");
	}
	if (text.length === 0) return undefined;
	try {
		return JSON.parse(text);
	} catch {
		throw new OgerError("Invalid JSON body", 400, "INVALID_JSON");
	}
}
