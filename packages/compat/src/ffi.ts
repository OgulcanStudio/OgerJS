import { useBunNative } from "./runtime";
import { createRequire } from "node:module";

const requireModule = createRequire(import.meta.url);

export const FFIType = {
	int8: "int8",
	uint8: "uint8",
	int16: "int16",
	uint16: "uint16",
	int32: "int32",
	uint32: "uint32",
	int64: "int64",
	uint64: "uint64",
	double: "double",
	float: "float",
	bool: "bool",
	ptr: "ptr",
	void: "void",
	cstring: "cstring",
	char: "char",
	i8: "int8",
	u8: "uint8",
	i16: "int16",
	u16: "uint16",
	i32: "int32",
	u32: "uint32",
	i64: "int64",
	u64: "uint64",
	f32: "float",
	f64: "double",
};

export const suffix =
	process.platform === "win32"
		? "dll"
		: process.platform === "darwin"
			? "dylib"
			: "so";

export function dlopen(path: string, symbols: any): any {
	if (useBunNative()) {
		const ffi = requireModule("bun:ffi");
		return ffi.dlopen(path, symbols);
	}

	const result: any = {
		symbols: {},
		close() {}
	};
	for (const key of Object.keys(symbols)) {
		result.symbols[key] = (...args: any[]) => {
			throw new Error(`[ogerjs] FFI function "${key}" from library "${path}" cannot be executed on Node.js runtime.`);
		};
	}
	return result;
}

export function ptr(val: any): number {
	if (useBunNative()) {
		const ffi = requireModule("bun:ffi");
		return ffi.ptr(val);
	}
	return 0;
}

export function slice(ptr: number, start?: number, end?: number): Uint8Array {
	if (useBunNative()) {
		const ffi = requireModule("bun:ffi");
		return ffi.slice(ptr, start, end);
	}
	return new Uint8Array(0);
}

export function toArrayBuffer(ptr: number, byteOffset?: number, byteLength?: number): ArrayBuffer {
	if (useBunNative()) {
		const ffi = requireModule("bun:ffi");
		return ffi.toArrayBuffer(ptr, byteOffset, byteLength);
	}
	return new ArrayBuffer(0);
}

export function viewSource(ptr: number, byteLength?: number): Uint8Array {
	if (useBunNative()) {
		const ffi = requireModule("bun:ffi");
		return ffi.viewSource(ptr, byteLength);
	}
	return new Uint8Array(0);
}

export class CString extends String {
	static toBuffer(str: string): Buffer {
		return Buffer.from(str + "\0");
	}
}
