import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { password } from "../src/password";

describe("password compatibility layer", () => {
	const runTests = () => {
		test("default hashing & verification", async () => {
			const pwd = "my-secure-password-123";
			const hash = await password.hash(pwd);
			expect(hash).toContain("$");

			const isValid = await password.verify(pwd, hash);
			expect(isValid).toBe(true);

			const isInvalid = await password.verify("wrong-password", hash);
			expect(isInvalid).toBe(false);
		});

		test("explicit scrypt hashing & verification", async () => {
			const pwd = "another-secret-pwd";
			const hash = await password.hash(pwd, { algorithm: "scrypt" });
			expect(hash).toMatch(/^\$scrypt\$/);

			const isValid = await password.verify(pwd, hash);
			expect(isValid).toBe(true);

			const isInvalid = await password.verify("wrong-password", hash);
			expect(isInvalid).toBe(false);
		});

		test("explicit pbkdf2 hashing & verification", async () => {
			const pwd = "pbkdf2-secret-pwd";
			const hash = await password.hash(pwd, { algorithm: "pbkdf2" });
			expect(hash).toMatch(/^\$pbkdf2\$/);

			const isValid = await password.verify(pwd, hash);
			expect(isValid).toBe(true);

			const isInvalid = await password.verify("wrong-password", hash);
			expect(isInvalid).toBe(false);
		});
	};

	describe("native Bun mode", () => {
		runTests();

		test("native Bun bcrypt hash verify", async () => {
			const pwd = "test-bcrypt-pwd";
			const hash = await password.hash(pwd, { algorithm: "bcrypt" });
			expect(hash).toMatch(/^\$2[ayb]\$/);

			const isValid = await password.verify(pwd, hash);
			expect(isValid).toBe(true);
		});
	});

	describe("forced Node compat mode", () => {
		beforeAll(() => {
			(globalThis as any).FORCE_NODE_COMPAT = true;
		});
		afterAll(() => {
			(globalThis as any).FORCE_NODE_COMPAT = false;
		});

		runTests();

		test("throws when attempting to verify bcrypt on Node.js", async () => {
			const bcryptHash = "$2a$12$N9qo8uLOqpGC123456789ae65432101234567890abcdefghijkl";
			await expect(password.verify("pwd", bcryptHash)).rejects.toThrow(
				/only supported natively on Bun runtime/,
			);
		});
	});
});
