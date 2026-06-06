import { definePluginWithOptionalOptions, timingSafeEqual } from "@ogerjs/core";

export interface CookieOptions {
	/** HMAC-sign cookie values on read/write. Requires `secret`. */
	signed?: boolean;
	/** AES-256-GCM encrypt cookie values on read/write. Requires `secret`. */
	encrypted?: boolean;
	/** Secret for signing/encryption (min 16 characters). */
	secret?: string;
}

const MIN_SECRET_LENGTH = 16;
const SIGNED_PREFIX = "s:";
const ENCRYPTED_PREFIX = "e:";

function assertSecret(secret: string | undefined): string {
	if (!secret || secret.length < MIN_SECRET_LENGTH) {
		throw new Error(
			`Cookie secret must be at least ${MIN_SECRET_LENGTH} characters`,
		);
	}
	return secret;
}

function base64url(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

function base64urlDecode(input: string): Uint8Array<ArrayBuffer> {
	const padded = input.replace(/-/g, "+").replace(/_/g, "/");
	const pad =
		padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
	const binary = atob(padded + pad);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

async function hmacSign(data: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(data),
	);
	return base64url(new Uint8Array(sig));
}

export async function signCookieValue(
	value: string,
	secret: string,
): Promise<string> {
	assertSecret(secret);
	const payload = base64url(new TextEncoder().encode(value));
	const sig = await hmacSign(payload, secret);
	return `${SIGNED_PREFIX}${payload}.${sig}`;
}

export async function unsignCookieValue(
	value: string,
	secret: string,
): Promise<string | null> {
	if (!value.startsWith(SIGNED_PREFIX)) return null;
	if (secret.length < MIN_SECRET_LENGTH) return null;

	const rest = value.slice(SIGNED_PREFIX.length);
	const dot = rest.lastIndexOf(".");
	if (dot < 0) return null;

	const payload = rest.slice(0, dot);
	const sig = rest.slice(dot + 1);
	const expected = await hmacSign(payload, secret);
	if (!timingSafeEqual(sig, expected)) return null;

	try {
		return new TextDecoder().decode(base64urlDecode(payload));
	} catch {
		return null;
	}
}

async function deriveAesKey(secret: string): Promise<CryptoKey> {
	const hash = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(secret),
	);
	return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, [
		"encrypt",
		"decrypt",
	]);
}

/** AES-256-GCM encrypt a cookie value (optional layer on top of signing). */
export async function encryptCookieValue(
	value: string,
	secret: string,
): Promise<string> {
	assertSecret(secret);
	const key = await deriveAesKey(secret);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		key,
		new TextEncoder().encode(value),
	);
	return `${ENCRYPTED_PREFIX}${base64url(iv)}.${base64url(new Uint8Array(ciphertext))}`;
}

/** Decrypt a value produced by `encryptCookieValue`. Returns null on failure. */
export async function decryptCookieValue(
	value: string,
	secret: string,
): Promise<string | null> {
	if (!value.startsWith(ENCRYPTED_PREFIX)) return null;
	if (secret.length < MIN_SECRET_LENGTH) return null;

	const rest = value.slice(ENCRYPTED_PREFIX.length);
	const dot = rest.indexOf(".");
	if (dot < 0) return null;

	try {
		const iv = base64urlDecode(rest.slice(0, dot));
		const data = base64urlDecode(rest.slice(dot + 1));
		const key = await deriveAesKey(secret);
		const plain = await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv },
			key,
			data,
		);
		return new TextDecoder().decode(plain);
	} catch {
		return null;
	}
}

async function protectCookieValue(
	value: string,
	secret: string,
	signed: boolean,
	encrypted: boolean,
): Promise<string> {
	let out = value;
	if (signed) out = await signCookieValue(out, secret);
	if (encrypted) out = await encryptCookieValue(out, secret);
	return out;
}

async function unprotectCookieValue(
	value: string,
	secret: string,
	signed: boolean,
	encrypted: boolean,
): Promise<string | null> {
	let out = value;
	if (encrypted) {
		const plain = await decryptCookieValue(out, secret);
		if (plain === null) return null;
		out = plain;
	}
	if (signed) {
		const plain = await unsignCookieValue(out, secret);
		if (plain === null) return null;
		out = plain;
	}
	return out;
}

function parseCookies(
	header: string | null,
): Record<string, { value: string }> {
	const out: Record<string, { value: string }> = {};
	if (!header) return out;
	for (const part of header.split(";")) {
		const [name, ...rest] = part.trim().split("=");
		if (!name) continue;
		out[name] = { value: decodeURIComponent(rest.join("=") ?? "") };
	}
	return out;
}

export function createCookieDescriptor(
	name: string,
	value: string,
	opts?: {
		maxAge?: number;
		path?: string;
		httpOnly?: boolean;
		secure?: boolean;
		sameSite?: "strict" | "lax" | "none";
	},
) {
	return {
		name,
		value,
		path: opts?.path ?? "/",
		httpOnly: opts?.httpOnly ?? true,
		secure: opts?.secure ?? process.env.NODE_ENV === "production",
		sameSite: opts?.sameSite ?? "lax",
		maxAge: opts?.maxAge,
	};
}

export const cookie = definePluginWithOptionalOptions<CookieOptions>(
	{ name: "@ogerjs/cookie" },
	(app, options) => {
		const signed = options.signed ?? false;
		const encrypted = options.encrypted ?? false;
		const needsSecret = signed || encrypted;
		const secret = needsSecret ? assertSecret(options.secret) : options.secret;

		return app
			.onRequest(async (ctx) => {
				const parsed = parseCookies(ctx.request.headers.get("cookie"));
				if (!needsSecret || !secret) {
					ctx.cookie = parsed;
					return;
				}
				const out: Record<string, { value: string }> = {};
				for (const [name, entry] of Object.entries(parsed)) {
					const plain = await unprotectCookieValue(
						entry.value,
						secret,
						signed,
						encrypted,
					);
					if (plain !== null) out[name] = { value: plain };
				}
				ctx.cookie = out;
			})
			.mapResponse(async (ctx) => {
				if (!needsSecret || !secret || !ctx.set.cookie) return;
				for (const opts of Object.values(ctx.set.cookie)) {
					const protectedValue = await protectCookieValue(
						opts.value,
						secret,
						signed,
						encrypted,
					);
					if (protectedValue !== opts.value) opts.value = protectedValue;
				}
			})
			.decorate({
				cookie: {
					set: createCookieDescriptor,
					...(secret
						? {
								...(signed
									? {
											sign: (value: string) => signCookieValue(value, secret),
											unsign: (value: string) =>
												unsignCookieValue(value, secret),
										}
									: {}),
								...(encrypted
									? {
											encrypt: (value: string) =>
												encryptCookieValue(value, secret),
											decrypt: (value: string) =>
												decryptCookieValue(value, secret),
										}
									: {}),
							}
						: {}),
				},
			});
	},
	{},
	(options) =>
		`${options.signed ?? false}:${options.encrypted ?? false}:${options.secret ?? ""}`,
);
