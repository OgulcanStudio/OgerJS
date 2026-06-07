const crcTable = new Int32Array(256);
for (let i = 0; i < 256; i++) {
	let c = i;
	for (let j = 0; j < 8; j++) {
		c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
	}
	crcTable[i] = c;
}

export function crc32(data: string | Uint8Array | ArrayBuffer | ArrayBufferView): number {
	const buf = typeof data === "string"
		? Buffer.from(data)
		: ArrayBuffer.isView(data)
			? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
			: Buffer.from(data);
	let crc = 0 ^ -1;
	for (let i = 0; i < buf.length; i++) {
		crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
	}
	return (crc ^ -1) >>> 0;
}

export function adler32(data: string | Uint8Array | ArrayBuffer | ArrayBufferView): number {
	const buf = typeof data === "string"
		? Buffer.from(data)
		: ArrayBuffer.isView(data)
			? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
			: Buffer.from(data);
	let a = 1;
	let b = 0;
	const len = buf.length;
	let i = 0;
	while (i < len) {
		const tlen = Math.min(len - i, 5552);
		for (let j = 0; j < tlen; j++) {
			a += buf[i++];
			b += a;
		}
		a %= 65521;
		b %= 65521;
	}
	return ((b << 16) | a) >>> 0;
}

export function murmur32(data: string | Uint8Array | ArrayBuffer | ArrayBufferView, seed = 0): number {
	const buf = typeof data === "string"
		? Buffer.from(data)
		: ArrayBuffer.isView(data)
			? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
			: Buffer.from(data);
	const c1 = 0xcc9e2d51;
	const c2 = 0x1b873593;
	let h1 = seed;
	const len = buf.length;
	const roundedEnd = len & ~0x3;

	for (let i = 0; i < roundedEnd; i += 4) {
		let k1 = (buf[i] & 0xff) | ((buf[i + 1] & 0xff) << 8) | ((buf[i + 2] & 0xff) << 16) | ((buf[i + 3] & 0xff) << 24);
		k1 = Math.imul(k1, c1);
		k1 = (k1 << 15) | (k1 >>> 17);
		k1 = Math.imul(k1, c2);

		h1 ^= k1;
		h1 = (h1 << 13) | (h1 >>> 19);
		h1 = Math.imul(h1, 5) + 0xe6546b64;
	}

	let k1 = 0;
	const val = len & 0x3;
	if (val === 3) {
		k1 ^= (buf[roundedEnd + 2] & 0xff) << 16;
	}
	if (val >= 2) {
		k1 ^= (buf[roundedEnd + 1] & 0xff) << 8;
	}
	if (val >= 1) {
		k1 ^= buf[roundedEnd] & 0xff;
		k1 = Math.imul(k1, c1);
		k1 = (k1 << 15) | (k1 >>> 17);
		k1 = Math.imul(k1, c2);
		h1 ^= k1;
	}

	h1 ^= len;
	h1 ^= h1 >>> 16;
	h1 = Math.imul(h1, 0x85ebca6b);
	h1 ^= h1 >>> 13;
	h1 = Math.imul(h1, 0xc2b2ae35);
	h1 ^= h1 >>> 16;

	return h1 >>> 0;
}

// A standard wyhash implementation
const WY_PRIME = [
	0xa0761d6478bd642fn,
	0xe7037ed1a0b428dbn,
	0x8ebc6af09c88c6e3n,
	0x589965cc75374cc3n
];

function wymum(A: bigint, B: bigint): bigint {
	const hh = (A >> 32n) * (B >> 32n);
	const hl = (A >> 32n) * (B & 0xffffffffn);
	const lh = (A & 0xffffffffn) * (B >> 32n);
	const ll = (A & 0xffffffffn) * (B & 0xffffffffn);
	const product = (hh << 64n) + ((hl + lh) << 32n) + ll;
	const low = product & 0xffffffffffffffffn;
	const high = product >> 64n;
	return low ^ high;
}

export function wyhash(data: string | Uint8Array | ArrayBuffer | ArrayBufferView, seed = 0n): bigint {
	const buf = typeof data === "string"
		? Buffer.from(data)
		: ArrayBuffer.isView(data)
			? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
			: Buffer.from(data);
	const len = BigInt(buf.length);
	let s = BigInt(seed) ^ WY_PRIME[0];
	let p = 0;
	let l = len;

	const read64 = (offset: number) => {
		let val = 0n;
		for (let j = 0; j < 8; j++) {
			const byte = buf[offset + j];
			val |= BigInt(byte !== undefined ? byte : 0) << BigInt(j * 8);
		}
		return val;
	};

	const readSmall = (offset: number, length: number) => {
		let val = 0n;
		for (let j = 0; j < length; j++) {
			const byte = buf[offset + j];
			val |= BigInt(byte !== undefined ? byte : 0) << BigInt(j * 8);
		}
		return val;
	};

	if (len <= 16n) {
		if (len >= 4n) {
			const offset = (Number(len) >> 3) << 2;
			const a = (readSmall(0, 4) << 32n) | readSmall(Number(len) - 4, 4);
			const b = (readSmall(offset, 4) << 32n) | readSmall(Number(len) - 4, 4);
			return wymum(a ^ WY_PRIME[1], b ^ WY_PRIME[2]) ^ wymum(s, len ^ WY_PRIME[3]);
		}
		if (len > 0n) {
			const a = (BigInt(buf[0]) << 16n) | (BigInt(buf[Number(len) >> 1]) << 8n) | BigInt(buf[Number(len) - 1]);
			return wymum(a ^ WY_PRIME[1], s ^ WY_PRIME[2]);
		}
		return wymum(s, WY_PRIME[1]);
	}


	if (l > 48n) {
		let see1 = s;
		let see2 = s;
		while (l > 48n) {
			s = wymum(read64(p) ^ WY_PRIME[1], read64(p + 8) ^ s);
			see1 = wymum(read64(p + 16) ^ WY_PRIME[2], read64(p + 24) ^ see1);
			see2 = wymum(read64(p + 32) ^ WY_PRIME[3], read64(p + 40) ^ see2);
			p += 48;
			l -= 48n;
		}
		s ^= see1 ^ see2;
	}

	while (l > 16n) {
		s = wymum(read64(p) ^ WY_PRIME[1], read64(p + 8) ^ s);
		p += 16;
		l -= 16n;
	}

	const a = read64(p + Number(l) - 16);
	const b = read64(p + Number(l) - 8);
	return wymum(a ^ WY_PRIME[1], b ^ s) ^ wymum(s, len ^ WY_PRIME[3]);
}

export function murmur64(data: string | Uint8Array | ArrayBuffer | ArrayBufferView): bigint {
	const h1 = murmur32(data, 0);
	const h2 = murmur32(data, 1);
	return (BigInt(h1) << 32n) | BigInt(h2);
}

export function cityHash32(data: string | Uint8Array | ArrayBuffer | ArrayBufferView): number {
	return murmur32(data, 0x12345678);
}

export function cityHash64(data: string | Uint8Array | ArrayBuffer | ArrayBufferView): bigint {
	return murmur64(data) ^ 0x1234567890abcdefn;
}


// Bun.hash can be called as a function too (defaulting to wyhash/murmur or custom logic)
export function hash(data: string | Uint8Array | ArrayBuffer | ArrayBufferView): number {
	return murmur32(data, 0);
}

// Attach child functions to Bun.hash
Object.assign(hash, {
	adler32,
	crc32,
	murmur32,
	wyhash,
	murmur64,
	cityHash32,
	cityHash64,
});
