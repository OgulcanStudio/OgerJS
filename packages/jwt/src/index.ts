import { definePluginWithOptions, t } from "@ogerjs/core";

export interface JwtOptions {
	secret: string;
	exp?: string;
}

const MIN_SECRET_LENGTH = 16;

function assertSecretStrength(secret: string): void {
	if (secret.length < MIN_SECRET_LENGTH) {
		throw new Error(
			`JWT secret must be at least ${MIN_SECRET_LENGTH} characters`,
		);
	}
}

function base64url(data: string): string {
	return btoa(data).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(input: string): string {
	const padded = input.replace(/-/g, "+").replace(/_/g, "/");
	const pad =
		padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
	return atob(padded + pad);
}

function parseExp(exp: string): number {
	const m = exp.match(/^(\d+)([smhd])$/);
	if (!m) return 3600;
	const n = Number(m[1]);
	const unit = m[2];
	const mult =
		unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 3600 : 86400;
	return n * mult;
}

export async function signJwt(
	payload: Record<string, unknown>,
	secret: string,
	exp = "1h",
): Promise<string> {
	assertSecretStrength(secret);
	const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
	const body = base64url(
		JSON.stringify({
			...payload,
			exp: Math.floor(Date.now() / 1000) + parseExp(exp),
		}),
	);
	const data = `${header}.${body}`;
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
	const sigB64 = base64url(String.fromCharCode(...new Uint8Array(sig)));
	return `${data}.${sigB64}`;
}

export async function verifyJwt(
	token: string,
	secret: string,
): Promise<Record<string, unknown> | null> {
	if (secret.length < MIN_SECRET_LENGTH) return null;
	const parts = token.split(".");
	if (parts.length !== 3) return null;
	const [headerPart, bodyPart, sigPart] = parts;

	let header: { alg?: string; typ?: string };
	try {
		header = JSON.parse(base64urlDecode(headerPart));
	} catch {
		return null;
	}

	if (header.alg !== "HS256" || header.typ !== "JWT") return null;

	const data = `${headerPart}.${bodyPart}`;
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["verify"],
	);
	const sigBytes = Uint8Array.from(base64urlDecode(sigPart), (c) =>
		c.charCodeAt(0),
	);
	const valid = await crypto.subtle.verify(
		"HMAC",
		key,
		sigBytes,
		new TextEncoder().encode(data),
	);
	if (!valid) return null;

	let payload: Record<string, unknown>;
	try {
		payload = JSON.parse(base64urlDecode(bodyPart));
	} catch {
		return null;
	}

	const exp = payload.exp;
	if (typeof exp !== "number") return null;
	if (exp < Math.floor(Date.now() / 1000)) return null;

	const nbf = payload.nbf;
	if (typeof nbf === "number" && nbf > Math.floor(Date.now() / 1000))
		return null;

	return payload;
}

export const jwt = definePluginWithOptions<JwtOptions>(
	{ name: "@ogerjs/jwt" },
	(app, options) => {
		assertSecretStrength(options.secret);
		const { secret } = options;
		return app
			.decorate({
				jwt: {
					sign: (payload: Record<string, unknown>) =>
						signJwt(payload, secret, options.exp),
					verify: (token: string) => verifyJwt(token, secret),
				},
			})
			.macro({
				jwt: {
					headers: t.Object({ authorization: t.Optional(t.String()) }),
					async resolve(ctx) {
						const auth = ctx.headers.authorization;
						if (!auth?.startsWith("Bearer ")) {
							return Response.json({ error: "Unauthorized" }, { status: 401 });
						}
						const token = auth.slice(7);
						const payload = await verifyJwt(token, secret);
						if (!payload)
							return Response.json({ error: "Unauthorized" }, { status: 401 });
						return { jwt: payload };
					},
				},
			});
	},
	(options) => options.secret,
);
