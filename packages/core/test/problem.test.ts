import { describe, expect, test } from "bun:test";
import { OgerError, ogerErrorResponse, validationResponse } from "../src/error";
import { notFoundProblem, PROBLEM_JSON } from "../src/problem";

describe("RFC 7807 problem details", () => {
	test("ogerErrorResponse uses application/problem+json", async () => {
		const res = ogerErrorResponse(new OgerError("Forbidden", 403, "FORBIDDEN"));
		expect(res.status).toBe(403);
		expect(res.headers.get("content-type")).toBe(PROBLEM_JSON);
		const body = await res.json();
		expect(body.title).toBe("Forbidden");
		expect(body.status).toBe(403);
		expect(body.code).toBe("FORBIDDEN");
	});

	test("validationResponse includes issues extension", async () => {
		const res = validationResponse([
			{ type: "required", property: "name", message: "Required" },
		]);
		expect(res.status).toBe(422);
		const body = await res.json();
		expect(body.code).toBe("VALIDATION_ERROR");
		expect(body.issues).toHaveLength(1);
	});

	test("notFoundProblem returns 404", async () => {
		const res = notFoundProblem("/missing");
		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body.code).toBe("NOT_FOUND");
		expect(body.instance).toBe("/missing");
	});
});

describe("Oger 404", () => {
	test("handle returns problem+json for unknown routes", async () => {
		const app = new (await import("../src/oger")).Oger();
		const res = await app.handle(new Request("http://localhost/nope"));
		expect(res.status).toBe(404);
		expect(res.headers.get("content-type")).toBe(PROBLEM_JSON);
	});
});
