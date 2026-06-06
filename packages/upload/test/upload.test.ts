import { describe, expect, test } from "bun:test";
import { parseMultipartUpload, UploadError } from "../src";

describe("@ogerjs/upload", () => {
	test("parses file and field", async () => {
		const fd = new FormData();
		fd.append("title", "doc");
		fd.append(
			"file",
			new File([new Uint8Array([1, 2, 3])], "a.bin", {
				type: "application/octet-stream",
			}),
		);

		const req = new Request("http://localhost/upload", {
			method: "POST",
			body: fd,
		});
		const { files, fields } = await parseMultipartUpload(req);
		expect(fields.title).toBe("doc");
		expect(files).toHaveLength(1);
		expect(files[0]?.size).toBe(3);
		expect(files[0]?.hash).toMatch(/^[a-f0-9]{64}$/);
	});

	test("rejects disallowed mime", async () => {
		const fd = new FormData();
		fd.append(
			"file",
			new File([""], "x.exe", { type: "application/x-msdownload" }),
		);

		const req = new Request("http://localhost/upload", {
			method: "POST",
			body: fd,
		});
		await expect(
			parseMultipartUpload(req, { allowedMimeTypes: ["image/"] }),
		).rejects.toBeInstanceOf(UploadError);
	});
});
