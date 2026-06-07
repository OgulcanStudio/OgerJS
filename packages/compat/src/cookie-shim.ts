export class Cookie {
	name: string;
	value: string;
	domain?: string;
	path?: string;
	expires?: Date;
	maxAge?: number;
	secure?: boolean;
	httpOnly?: boolean;
	sameSite?: "strict" | "lax" | "none";

	constructor(name: string, value: string, options: Partial<Cookie> = {}) {
		this.name = name;
		this.value = value;
		Object.assign(this, options);
	}

	static parse(header: string): Cookie[] {
		const cookies: Cookie[] = [];
		for (const part of header.split(";")) {
			const trimmed = part.trim();
			if (!trimmed) continue;
			const eq = trimmed.indexOf("=");
			if (eq === -1) continue;
			cookies.push(new Cookie(trimmed.substring(0, eq).trim(), trimmed.substring(eq + 1).trim()));
		}
		return cookies;
	}

	toString(): string {
		let out = `${this.name}=${this.value}`;
		if (this.domain) out += `; Domain=${this.domain}`;
		if (this.path) out += `; Path=${this.path}`;
		if (this.expires) out += `; Expires=${this.expires.toUTCString()}`;
		if (this.maxAge !== undefined) out += `; Max-Age=${this.maxAge}`;
		if (this.secure) out += "; Secure";
		if (this.httpOnly) out += "; HttpOnly";
		if (this.sameSite) out += `; SameSite=${this.sameSite.charAt(0).toUpperCase()}${this.sameSite.slice(1)}`;
		return out;
	}
}

export class CookieMap extends Map<string, string> {
	constructor(init?: string | Iterable<[string, string]>) {
		super();
		if (typeof init === "string") {
			for (const cookie of Cookie.parse(init)) {
				this.set(cookie.name, cookie.value);
			}
		} else if (init) {
			for (const [k, v] of init) this.set(k, v);
		}
	}

	toSetCookieHeaders(): string[] {
		return [...this.entries()].map(([name, value]) => new Cookie(name, value).toString());
	}
}