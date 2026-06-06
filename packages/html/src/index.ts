/** Utility package `@ogerjs/html` — helpers, not an `Oger.use()` plugin. */
export const PACKAGE_NAME = "@ogerjs/html" as const;

export function html(content: string, status = 200): Response {
	return new Response(content, {
		status,
		headers: { "content-type": "text/html; charset=utf-8" },
	});
}

export function htmlLayout(title: string, body: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${title}</title>
</head>
<body>
${body}
</body>
</html>`;
}

export interface DashboardSection {
	title: string;
	content: string;
}

/** Minimal SSR dashboard layout without external UI frameworks. */
export function dashboardLayout(
	title: string,
	sections: DashboardSection[],
): string {
	const body = sections
		.map((s) => `<section><h2>${s.title}</h2>${s.content}</section>`)
		.join("\n");
	return htmlLayout(title, `<main>${body}</main>`);
}

export function metricCard(label: string, value: string | number): string {
	return `<div class="metric"><strong>${label}</strong><span>${value}</span></div>`;
}

export function tableFromRows(rows: Record<string, unknown>[]): string {
	if (!rows.length) return "<p>No data</p>";
	const keys = Object.keys(rows[0]!);
	const head = keys.map((k) => `<th>${k}</th>`).join("");
	const body = rows
		.map(
			(row) =>
				`<tr>${keys.map((k) => `<td>${String(row[k] ?? "")}</td>`).join("")}</tr>`,
		)
		.join("");
	return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
