export class OgerHeaders {
	readonly _isOgerHeaders = true;
	readonly _map: Record<string, string[]> = Object.create(null);

	constructor(init?: any) {
		if (init) {
			if (init._isOgerHeaders) {
				const map = (init as OgerHeaders)._map;
				for (const k in map) {
					this._map[k] = [...map[k]];
				}
			} else if (typeof init.forEach === "function") {
				init.forEach((v: string, k: string) => {
					this.append(k, v);
				});
			} else if (typeof init === "object") {
				for (const k in init) {
					if (Object.prototype.hasOwnProperty.call(init, k)) {
						const v = init[k];
						if (v !== undefined && v !== null) {
							if (Array.isArray(v)) {
								for (let i = 0; i < v.length; i++) {
									this.append(k, String(v[i]));
								}
							} else {
								this.set(k, String(v));
							}
						}
					}
				}
			}
		}
	}

	get(name: string): string | null {
		const list = this._map[name.toLowerCase()];
		return list ? list.join(", ") : null;
	}

	set(name: string, value: string): void {
		this._map[name.toLowerCase()] = [value];
	}

	append(name: string, value: string): void {
		const key = name.toLowerCase();
		if (!this._map[key]) {
			this._map[key] = [value];
		} else {
			this._map[key]!.push(value);
		}
	}

	has(name: string): boolean {
		return this._map[name.toLowerCase()] !== undefined;
	}

	delete(name: string): void {
		delete this._map[name.toLowerCase()];
	}

	forEach(callback: (value: string, key: string) => void): void {
		const map = this._map;
		for (const key in map) {
			callback(map[key].join(", "), key);
		}
	}

	*entries(): Generator<[string, string]> {
		const map = this._map;
		for (const key in map) {
			yield [key, map[key].join(", ")];
		}
	}

	*keys(): Generator<string> {
		const map = this._map;
		for (const key in map) {
			yield key;
		}
	}

	*values(): Generator<string> {
		const map = this._map;
		for (const key in map) {
			yield map[key].join(", ");
		}
	}

	[Symbol.iterator]() {
		return this.entries();
	}
}

export class OgerResponse {
	readonly _isOgerResponse = true;
	readonly status: number;
	readonly statusText: string;
	readonly body: ReadableStream | null;
	_rawBody?: string | Buffer;
	_rawHeaders?: Record<string, string | string[]>;
	private _headers?: OgerHeaders;

	constructor(body: any, init?: any) {
		this.status = init?.status ?? 200;
		this.statusText = init?.statusText ?? "";

		if (init?.headers instanceof OgerHeaders) {
			this._headers = init.headers;
		} else if (init?.headers) {
			this._rawHeaders = init.headers;
		}

		if (body === null || body === undefined) {
			this._rawBody = "";
			this.body = null;
		} else if (typeof body === "string") {
			this._rawBody = body;
			this.body = null;
		} else if (Buffer.isBuffer(body)) {
			this._rawBody = body;
			this.body = null;
		} else if (body instanceof ReadableStream || (body && typeof body.getReader === "function")) {
			this.body = body;
			this._rawBody = undefined;
		} else if (body instanceof ArrayBuffer) {
			this._rawBody = Buffer.from(body);
			this.body = null;
		} else if (ArrayBuffer.isView(body)) {
			this._rawBody = Buffer.from(body.buffer as ArrayBuffer, body.byteOffset, body.byteLength);
			this.body = null;
		} else {
			this._rawBody = String(body);
			this.body = null;
		}
	}

	get headers(): OgerHeaders {
		if (!this._headers) {
			this._headers = new OgerHeaders(this._rawHeaders);
		}
		return this._headers;
	}

	async text(): Promise<string> {
		if (this._rawBody !== undefined) {
			return typeof this._rawBody === "string" ? this._rawBody : this._rawBody.toString("utf8");
		}
		if (this.body) {
			const reader = this.body.getReader();
			const decoder = new TextDecoder();
			let out = "";
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				out += decoder.decode(value, { stream: true });
			}
			out += decoder.decode();
			return out;
		}
		return "";
	}

	async json(): Promise<unknown> {
		const txt = await this.text();
		return JSON.parse(txt);
	}

	async arrayBuffer(): Promise<ArrayBuffer> {
		if (this._rawBody !== undefined) {
			const buf = typeof this._rawBody === "string" ? Buffer.from(this._rawBody, "utf8") : this._rawBody;
			return (buf.buffer as ArrayBuffer).slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
		}
		if (this.body) {
			const reader = this.body.getReader();
			const chunks: Uint8Array[] = [];
			let total = 0;
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				chunks.push(value);
				total += value.byteLength;
			}
			const out = new Uint8Array(total);
			let offset = 0;
			for (const chunk of chunks) {
				out.set(chunk, offset);
				offset += chunk.byteLength;
			}
			return out.buffer;
		}
		return new ArrayBuffer(0);
	}

	clone(): OgerResponse {
		const cloned = new OgerResponse(null, {
			status: this.status,
			statusText: this.statusText,
		});
		cloned._rawBody = this._rawBody;
		if (this._rawHeaders) {
			const newRaw: Record<string, string | string[]> = {};
			const raw = this._rawHeaders;
			for (const k in raw) {
				if (Object.prototype.hasOwnProperty.call(raw, k)) {
					const val = raw[k];
					newRaw[k] = Array.isArray(val) ? [...val] : val;
				}
			}
			cloned._rawHeaders = newRaw;
		}
		if (this._headers) {
			cloned._headers = new OgerHeaders(this._headers);
		}
		return cloned;
	}
}

if (typeof Bun === "undefined") {
	const globalRef = globalThis as any;

	// Save original Response/Headers for fallback or internal reference if needed
	const NativeResponse = globalRef.Response;
	const NativeHeaders = globalRef.Headers;

	globalRef.Response = OgerResponse;
	globalRef.Headers = OgerHeaders;

	// Override Symbol.hasInstance on OgerResponse and OgerHeaders
	// so that native instances or our custom instances both return true
	try {
		Object.defineProperty(OgerResponse, Symbol.hasInstance, {
			value(instance: any) {
				return instance && (
					instance._isOgerResponse ||
					instance.constructor?.name === "Response"
				);
			},
			configurable: true
		});
	} catch {}

	try {
		Object.defineProperty(OgerHeaders, Symbol.hasInstance, {
			value(instance: any) {
				return instance && (
					instance._isOgerHeaders ||
					instance.constructor?.name === "Headers"
				);
			},
			configurable: true
		});
	} catch {}

	// If global native constructors exist, add hasInstance support to them too
	if (NativeResponse) {
		try {
			Object.defineProperty(NativeResponse, Symbol.hasInstance, {
				value(instance: any) {
					return instance && (
						instance._isOgerResponse ||
						instance.constructor?.name === "Response"
					);
				},
				configurable: true
			});
		} catch {}
	}

	if (NativeHeaders) {
		try {
			Object.defineProperty(NativeHeaders, Symbol.hasInstance, {
				value(instance: any) {
					return instance && (
						instance._isOgerHeaders ||
						instance.constructor?.name === "Headers"
					);
				},
				configurable: true
			});
		} catch {}
	}
}
