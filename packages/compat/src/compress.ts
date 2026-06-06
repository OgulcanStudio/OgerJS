import zlib from "node:zlib";
import { useBunNative } from "./runtime";

function toUint8Array(buf: Buffer): Uint8Array {
	return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

export const compress = {
	gzip(data: Uint8Array | string): Uint8Array {
		if (useBunNative()) {
			return Bun.gzipSync(data as any);
		}
		return toUint8Array(zlib.gzipSync(data));
	},
	gunzip(data: Uint8Array): Uint8Array {
		if (useBunNative()) {
			return Bun.gunzipSync(data as any);
		}
		return toUint8Array(zlib.gunzipSync(data));
	},
	deflate(data: Uint8Array | string): Uint8Array {
		if (useBunNative()) {
			return Bun.deflateSync(data as any);
		}
		return toUint8Array(zlib.deflateSync(data));
	},
	inflate(data: Uint8Array): Uint8Array {
		if (useBunNative()) {
			return Bun.inflateSync(data as any);
		}
		return toUint8Array(zlib.inflateSync(data));
	},
	zstd(data: Uint8Array | string): Uint8Array {
		if (useBunNative()) {
			return Bun.zstdCompressSync(data as any);
		}
		return toUint8Array(zlib.zstdCompressSync(data));
	},
	unzstd(data: Uint8Array): Uint8Array {
		if (useBunNative()) {
			return Bun.zstdDecompressSync(data as any);
		}
		return toUint8Array(zlib.zstdDecompressSync(data));
	},
	brotli(data: Uint8Array | string): Uint8Array {
		return toUint8Array(zlib.brotliCompressSync(data));
	},
	unbrotli(data: Uint8Array): Uint8Array {
		return toUint8Array(zlib.brotliDecompressSync(data));
	},
};
