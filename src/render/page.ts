// Wraps rendered output in a self-contained HTML page: no scripts, no
// network requests, data embedded at build time.

import { escapeHtml } from "./inline";
import { renderYaml, type RenderOptions } from "./render";
import { PAGE_CSS, RENDER_CSS } from "./styles";

export interface PageResult {
  html: string;
  errors: string[];
}

export function renderPage(yamlText: string, opts: RenderOptions & { source?: string; generated?: string } = {}): PageResult {
  const r = renderYaml(yamlText, opts);
  const errors = r.errors.length
    ? `<div class="yr-note"><p><strong>YAML errors:</strong></p>${r.errors.map((e) => `<p><code>${escapeHtml(e)}</code></p>`).join("")}</div>`
    : "";
  const footer = opts.source || opts.generated
    ? `<footer class="yr-note" style="margin-top:3rem">${opts.source ? `<p>Rendered from <code>${escapeHtml(opts.source)}</code>${opts.generated ? ` on ${escapeHtml(opts.generated)}` : ""}. Edit the YAML, not this page.</p>` : ""}</footer>`
    : "";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(r.title)}</title>
<style>${RENDER_CSS}${PAGE_CSS}</style>
</head>
<body>
<main class="yr-doc">${errors}${r.html}${footer}</main>
</body>
</html>
`;
  return { html, errors: r.errors };
}
