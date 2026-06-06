import crypto from "node:crypto";

export interface UploadedFile {
	field: string;
	name: string;
	type: string;
	size: number;
	/** SHA-256 hex digest of file bytes. */
	hash: string;
	data: Uint8Array;
}

export interface ParseUploadOptions {
	maxFileSize?: number;
	maxFiles?: number;
	allowedMimeTypes?: string[];
	/** Hook before accepting file — return false to reject. */
	virusScan?: (file: UploadedFile) => boolean | Promise<boolean>;
}

function sha256Hex(data: Uint8Array): string {
	if (typeof Bun !== "undefined") {
		const hash = new Bun.CryptoHasher("sha256");
		hash.update(data);
		return hash.digest("hex");
	} else {
		const hash = crypto.createHash("sha256");
		hash.update(data);
		return hash.digest("hex");
	}
}

/**
 * Parse `multipart/form-data` from a Request using Bun APIs.
 * For large uploads prefer streaming adapters in a future revision.
 */
export async function parseMultipartUpload(
	request: Request,
	options: ParseUploadOptions = {},
): Promise<{ files: UploadedFile[]; fields: Record<string, string> }> {
	const maxSize = options.maxFileSize ?? 10 * 1024 * 1024;
	const maxFiles = options.maxFiles ?? 8;
	const allowed = options.allowedMimeTypes;

	const form = await request.formData();
	const files: UploadedFile[] = [];
	const fields: Record<string, string> = {};

	for (const [key, value] of form.entries()) {
		if (typeof value === "string") {
			fields[key] = value;
			continue;
		}

		if (files.length >= maxFiles) {
			throw new UploadError("Too many files", "too_many_files");
		}

		const blob = value as Blob;
		const buf = new Uint8Array(await blob.arrayBuffer());
		if (buf.byteLength > maxSize) {
			throw new UploadError("File too large", "file_too_large");
		}

		const type = blob.type || "application/octet-stream";
		if (allowed?.length && !allowed.some((m) => type.startsWith(m))) {
			throw new UploadError("MIME type not allowed", "mime_rejected");
		}

		const uploaded: UploadedFile = {
			field: key,
			name: (value as File).name ?? key,
			type,
			size: buf.byteLength,
			hash: sha256Hex(buf),
			data: buf,
		};

		if (options.virusScan) {
			const clean = await options.virusScan(uploaded);
			if (!clean) throw new UploadError("File rejected", "scan_rejected");
		}

		files.push(uploaded);
	}

	return { files, fields };
}

export class UploadError extends Error {
	constructor(
		message: string,
		readonly code: string,
	) {
		super(message);
		this.name = "UploadError";
	}
}
