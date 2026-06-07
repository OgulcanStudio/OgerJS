import fs from "node:fs";

export async function write(
	destination: string | { path: string },
	input: string | Blob | ArrayBuffer | ArrayBufferView | Response | ReadableStream,
): Promise<number> {
	const path = typeof destination === "string" ? destination : destination.path;
	let data: Buffer;

	if (typeof input === "string") {
		data = Buffer.from(input);
	} else if (input instanceof Response) {
		const arrayBuf = await input.arrayBuffer();
		data = Buffer.from(arrayBuf);
	} else if (input instanceof Blob) {
		const arrayBuf = await input.arrayBuffer();
		data = Buffer.from(arrayBuf);
	} else if (ArrayBuffer.isView(input)) {
		data = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
	} else if (input instanceof ArrayBuffer) {
		data = Buffer.from(input);
	} else if (typeof input === "object" && input !== null && "getReader" in input) {
		const reader = (input as any).getReader();
		const chunks: Uint8Array[] = [];
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value) chunks.push(value);
		}
		const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
		const combined = new Uint8Array(totalLength);
		let offset = 0;
		for (const chunk of chunks) {
			combined.set(chunk, offset);
			offset += chunk.length;
		}
		data = Buffer.from(combined);
	} else {
		data = Buffer.from(String(input));
	}

	await fs.promises.writeFile(path, data);
	return data.length;
}
