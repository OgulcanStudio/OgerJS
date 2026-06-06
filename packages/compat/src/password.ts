import crypto from "node:crypto";

export interface PasswordHashOptions {
	algorithm?: "bcrypt" | "argon2id" | "argon2d" | "argon2i" | "scrypt" | "pbkdf2";
}

export const password = {
	async hash(
		passwordStr: string,
		options?: PasswordHashOptions,
	): Promise<string> {
		const isBun = typeof Bun !== "undefined" && !(globalThis as any).FORCE_NODE_COMPAT;
		const algo = options?.algorithm || (isBun ? "bcrypt" : "scrypt");

		if (isBun && ["bcrypt", "argon2id", "argon2d", "argon2i"].includes(algo)) {
			return Bun.password.hash(passwordStr, algo as any);
		}

		if (algo === "pbkdf2") {
			const salt = crypto.randomBytes(16).toString("hex");
			const hash = crypto.pbkdf2Sync(passwordStr, salt, 10000, 64, "sha512").toString("hex");
			return `$pbkdf2$sha512$i=10000$${salt}$${hash}`;
		}

		if (algo === "scrypt" || (!isBun && ["bcrypt", "argon2id", "argon2d", "argon2i"].includes(algo))) {
			const salt = crypto.randomBytes(16).toString("hex");
			const hash = crypto.scryptSync(passwordStr, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
			return `$scrypt$N=16384,r=8,p=1$${salt}$${hash}`;
		}

		throw new Error(`[ogerjs] Unsupported password hashing algorithm: ${algo}`);
	},

	async verify(passwordStr: string, hash: string): Promise<boolean> {
		const isBun = typeof Bun !== "undefined" && !(globalThis as any).FORCE_NODE_COMPAT;

		if (
			hash.startsWith("$2a$") ||
			hash.startsWith("$2y$") ||
			hash.startsWith("$2b$") ||
			hash.startsWith("$argon2")
		) {
			if (isBun) {
				return Bun.password.verify(passwordStr, hash);
			}
			throw new Error(
				`[ogerjs] Verification of "${hash.split("$")[1]}" hashes is only supported natively on Bun runtime. Node.js does not support bcrypt/argon2 natively.`,
			);
		}

		if (hash.startsWith("$pbkdf2$")) {
			const parts = hash.split("$");
			const algo = parts[2];
			const iterations = parseInt(parts[3].replace("i=", ""), 10);
			const salt = parts[4];
			const hashValue = parts[5];
			const testHash = crypto.pbkdf2Sync(passwordStr, salt, iterations, 64, algo).toString("hex");
			return crypto.timingSafeEqual(
				Buffer.from(testHash, "hex"),
				Buffer.from(hashValue, "hex"),
			);
		}

		if (hash.startsWith("$scrypt$")) {
			const parts = hash.split("$");
			const params = parts[2].split(",").reduce((acc, curr) => {
				const [k, v] = curr.split("=");
				acc[k] = parseInt(v, 10);
				return acc;
			}, {} as any);
			const salt = parts[3];
			const hashValue = parts[4];
			const testHash = crypto.scryptSync(passwordStr, salt, 64, {
				N: params.N,
				r: params.r,
				p: params.p,
			}).toString("hex");
			return crypto.timingSafeEqual(
				Buffer.from(testHash, "hex"),
				Buffer.from(hashValue, "hex"),
			);
		}

		throw new Error("[ogerjs] Unsupported password hash format.");
	},
};
