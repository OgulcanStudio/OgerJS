const NAMED: Record<string, string> = {
	red: "#ff0000",
	green: "#00ff00",
	blue: "#0000ff",
	white: "#ffffff",
	black: "#000000",
	transparent: "#00000000",
};

export function parse(input: string): string {
	const trimmed = input.trim().toLowerCase();
	if (trimmed in NAMED) return NAMED[trimmed]!;
	if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) return trimmed;
	const rgb = trimmed.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
	if (rgb) {
		const r = Number(rgb[1]).toString(16).padStart(2, "0");
		const g = Number(rgb[2]).toString(16).padStart(2, "0");
		const b = Number(rgb[3]).toString(16).padStart(2, "0");
		return `#${r}${g}${b}`;
	}
	return trimmed;
}

export const color = { parse };