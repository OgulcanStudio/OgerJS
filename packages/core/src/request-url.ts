/** Pathname from a request URL string without allocating a `URL` object. */
export function requestPathname(url: string): string {
	if (url.charCodeAt(0) === 47) {
		const query = url.indexOf("?");
		if (query === -1) {
			const hash = url.indexOf("#");
			if (hash === -1) return url;
			return url.substring(0, hash);
		}
		const hash = url.indexOf("#");
		if (hash !== -1 && hash < query) return url.substring(0, hash);
		return url.substring(0, query);
	}
	const start = url.indexOf("/", url.charCodeAt(4) === 115 ? 8 : 7);
	if (start === -1) return "/";
	const query = url.indexOf("?", start);
	if (query === -1) {
		const hash = url.indexOf("#", start);
		if (hash === -1) return url.substring(start);
		return url.substring(start, hash);
	}
	const hash = url.indexOf("#", start);
	if (hash !== -1 && hash < query) return url.substring(start, hash);
	return url.substring(start, query);
}

