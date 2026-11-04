// Renders a YAML document as a plain HTML report. Pure: text in, HTML string
// out, every value escaped. Knows no schema; layout comes from the shape of
// the data plus the optional `_view` hints (hints.ts, RENDER.md).
//
// The markup is deliberately simple: headings, paragraphs, bullet lists and
// tables, styled inline. That is what survives a paste into Word or Google
// Docs, opening the file in Word, or converting it in Google Drive. No
// classes, grid, flex, CSS variables, scripts or internal anchors.

import { parseAllDocuments } from "yaml";
import { getPath, readHints, type ListHints, type ViewHints } from "./hints";
import { asPath, escapeHtml, renderInline, renderPath } from "./inline";
import { buildRefs, humanize, isObj, isScalar, leadingComment, titleOf, TITLE_KEYS, type Obj, type RefIndex } from "./util";

export interface RenderOptions {
  /** Title when neither `_view.title` nor a top-level `title` exists, e.g. the filename. */
  fallbackTitle?: string;
}

export interface RenderResult {
  html: string;
  title: string;
  errors: string[];
}

const FONT = "font-family:Arial,Helvetica,sans-serif";
const TABLE = "border-collapse:collapse;width:100%;table-layout:fixed;margin:0 0 8pt 0";
const CELL = `border:1px solid #bfbfbf;padding:3pt 5pt;vertical-align:top;text-align:left;${FONT};font-size:10pt`;
const HEAD_CELL = `${CELL};background:#f2f2f2;font-weight:bold`;
const LABEL_CELL = `${CELL};background:#f7f7f7;font-weight:bold`;
const P = `margin:0 0 6pt 0;${FONT};font-size:11pt`;
const LABEL_P = "margin:8pt 0 2pt 0";
const NOTE_P = "margin:0 0 4pt 0;color:#595959;font-style:italic";
const SHORT = 100;
const HEADLINE_CUT = 48;

function heading(level: number, html: string): string {
  const lv = Math.min(Math.max(level, 1), 4);
  const size = ["20pt", "15pt", "13pt", "11pt"][lv - 1];
  return `<h${lv} style="${FONT};font-size:${size};font-weight:bold;margin:${lv <= 2 ? "16pt" : "12pt"} 0 4pt 0">${html}</h${lv}>`;
}

/** `width` attributes as well as CSS: LibreOffice's HTML import (used for .docx) only honours the attributes. */
function table(widths: number[], inner: string): string {
  const cols = widths.map((w) => `<col width="${w}%" style="width:${w}%">`).join("");
  return `<table width="100%" style="${TABLE}"><colgroup>${cols}</colgroup>${inner}</table>`;
}

class Renderer {
  private refs: RefIndex;
  constructor(
    private data: Obj,
    private hints: ViewHints,
  ) {
    this.refs = buildRefs(data);
  }

  label(key: string, path: string): string {
    return this.hints.labels?.[path] ?? this.hints.labels?.[key] ?? humanize(key);
  }

  inline(s: string): string {
    const ref = this.refs.get(s.trim());
    if (ref) return escapeHtml(ref.label);
    const p = asPath(s);
    if (p) return renderPath(p.path, p.note, this.refs);
    return renderInline(s, this.refs);
  }

  /** Paragraphs on blank lines; a block of "- " lines becomes a bullet list. */
  prose(s: string): string {
    return s
      .trim()
      .split(/\n\s*\n/)
      .map((block) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
          return `<ul style="${P}">${lines.map((l) => `<li>${this.inline(l.replace(/^\s*[-*]\s+/, ""))}</li>`).join("")}</ul>`;
        }
        return `<p style="${P}">${this.inline(lines.join(" "))}</p>`;
      })
      .join("");
  }

  /** A value that fits in a table cell or on one line, or null. */
  short(v: unknown): string | null {
    if (v === null || v === undefined || v === "") return "—";
    if (typeof v === "boolean") return v ? "Yes" : "No";
    if (typeof v === "number") return String(v);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === "string" && v.length <= SHORT && !v.includes("\n")) return this.inline(v);
    if (Array.isArray(v) && v.length && v.every((x) => typeof x === "string" && x.length <= 40)) {
      return (v as string[]).map((x) => this.inline(x)).join(", ");
    }
    return null;
  }

  /** Any value as block content. */
  block(v: unknown, path: string, depth: number, skip: string[] = []): string {
    const s = this.short(v);
    if (s !== null) return `<p style="${P}">${s}</p>`;
    if (typeof v === "string") return this.prose(v);
    if (Array.isArray(v)) return this.list(v, path, depth);
    if (isObj(v)) return this.fields(v, path, depth, skip);
    return `<p style="${P}">${escapeHtml(String(v))}</p>`;
  }

  /**
   * A map: runs of short values as a two-column label table; longer values
   * as a bold label paragraph followed by the content. Key order is kept.
   * `skip` holds dotted paths, relative to this map, already shown elsewhere.
   */
  fields(obj: Obj, path: string, depth: number, skip: string[] = []): string {
    let out = "";
    let rows: string[] = [];
    const flush = () => {
      if (rows.length) out += table([28, 72], `<tbody>${rows.join("")}</tbody>`);
      rows = [];
    };
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith("_") || skip.includes(k)) continue;
      const sub = skip.filter((s) => s.startsWith(`${k}.`)).map((s) => s.slice(k.length + 1));
      if (isObj(v) && Object.keys(v).length && Object.keys(v).every((kk) => kk.startsWith("_") || sub.includes(kk))) continue;
      const childPath = path ? `${path}.${k}` : k;
      const label = escapeHtml(this.label(k, childPath));
      const s = this.short(v);
      if (s !== null) {
        rows.push(`<tr><td style="${LABEL_CELL}"><strong>${label}</strong></td><td style="${CELL}">${s}</td></tr>`);
        continue;
      }
      flush();
      out += `<p style="${LABEL_P}"><strong>${label}</strong></p>${this.block(v, childPath, depth + 1, sub)}`;
    }
    flush();
    return out;
  }

  tableable(items: unknown[]): boolean {
    if (!items.every(isObj)) return false;
    const keys = new Set(items.flatMap((i) => Object.keys(i as Obj).filter((k) => !k.startsWith("_"))));
    return keys.size <= 6 && items.every((i) => Object.values(i as Obj).every((v) => isScalar(v) && String(v ?? "").length <= 80));
  }

  list(items: unknown[], path: string, depth: number, hints?: ListHints): string {
    if (!items.length) return `<p style="${P}">—</p>`;
    const objs = items.every(isObj);
    const layout = hints?.as ?? (!objs ? "list" : this.tableable(items) ? "table" : "cards");
    if (layout === "table" && objs) return this.table(items as Obj[], path);
    if (layout === "cards" && objs) return this.cards(items as Obj[], path, depth, hints);
    return `<ul style="${P}">${items
      .map((i) => `<li>${this.short(i) ?? (typeof i === "string" ? this.inline(i) : this.block(i, path, depth + 1))}</li>`)
      .join("")}</ul>`;
  }

  table(items: Obj[], path: string): string {
    const keys: string[] = [];
    for (const i of items) for (const k of Object.keys(i)) if (!k.startsWith("_") && !keys.includes(k)) keys.push(k);
    const w = Math.floor(100 / keys.length);
    return table(
      keys.map(() => w),
      `<thead><tr>${keys.map((k) => `<th style="${HEAD_CELL}">${escapeHtml(this.label(k, `${path}.${k}`))}</th>`).join("")}</tr></thead>` +
        `<tbody>${items.map((i) => `<tr>${keys.map((k) => `<td style="${CELL}">${this.short(i[k]) ?? this.inline(String(i[k]))}</td>`).join("")}</tr>`).join("")}</tbody>`,
    );
  }

  /** Records as a heading each, a "Label: value" headline line, narrative paragraphs, then the remaining fields. */
  cards(items: Obj[], path: string, depth: number, hints?: ListHints): string {
    return items
      .map((item, i) => {
        const titleKey = hints?.title ?? TITLE_KEYS.find((k) => typeof item[k] === "string" || typeof item[k] === "number");
        const title = titleOf(item, hints?.title) ?? `Item ${i + 1}`;
        const skip: string[] = titleKey ? [titleKey] : [];
        const head: string[] = [];
        for (const hl of hints?.headline ?? []) {
          const v = getPath(item, hl);
          if (typeof v !== "string" && typeof v !== "number") continue;
          const s = String(v);
          const ref = this.refs.get(s.trim());
          // Long values are cut to their first clause here and still shown in full below.
          const cut = s.search(/[.;(]\s|,\s/);
          const text = ref ? ref.label : cut > 0 && cut < HEADLINE_CUT ? s.slice(0, cut) : s;
          head.push(`<strong>${escapeHtml(this.label(hl.split(".").pop() ?? hl, `${path}.${hl}`))}:</strong> ${ref ? escapeHtml(text) : this.inline(text)}`);
          if (ref || text === s) skip.push(hl);
        }
        let out = heading(depth <= 1 ? 3 : 4, this.inline(title));
        if (head.length) out += `<p style="${P}">${head.join(" &nbsp;·&nbsp; ")}</p>`;
        for (const np of hints?.narrative ?? []) {
          const v = getPath(item, np);
          if (v === undefined) continue;
          out += `<p style="${LABEL_P}"><strong>${escapeHtml(this.label(np.split(".").pop() ?? np, `${path}.${np}`))}</strong></p>${this.block(v, `${path}.${np}`, depth + 1)}`;
          skip.push(np);
        }
        return out + this.fields(item, path, depth, skip);
      })
      .join("");
  }

  /** A top-level map of maps (a legend): one heading per entry. */
  entries(section: string, obj: Obj): string {
    return Object.entries(obj)
      .map(([key, entry]) => {
        const e = entry as Obj;
        const labelKey = ["label", "title", "name"].find((k) => typeof e[k] === "string");
        const label = labelKey ? String(e[labelKey]) : humanize(key);
        return heading(3, this.inline(label)) + this.fields(e, `${section}.${key}`, 2, labelKey ? [labelKey] : []);
      })
      .join("");
  }

  matrix(m: { title?: string; rows: string; cols: string }): string {
    const rows = this.data[m.rows];
    if (!Array.isArray(rows)) return "";
    const lh = this.hints.lists?.[m.rows];
    const colOf = (item: unknown): string | undefined => {
      const v = getPath(item, m.cols);
      if (typeof v !== "string") return v === undefined || v === null ? undefined : String(v);
      const lead = /^[A-Za-z0-9_]+/.exec(v.trim())?.[0];
      return lead && this.refs.has(lead) ? lead : v.length > 40 ? `${v.slice(0, 40)}…` : v;
    };
    const cols: string[] = [];
    for (const r of rows) {
      const c = colOf(r);
      if (c !== undefined && !cols.includes(c)) cols.push(c);
    }
    const order = [...this.refs.keys()];
    cols.sort((a, b) => (order.indexOf(a) + 1 || 1e9) - (order.indexOf(b) + 1 || 1e9));
    const head = cols.map((c) => `<th style="${HEAD_CELL};text-align:center">${escapeHtml(this.refs.get(c)?.label ?? c)}</th>`).join("");
    const body = rows
      .map((r, i) => {
        const c = colOf(r);
        return `<tr><td style="${LABEL_CELL}"><strong>${escapeHtml(titleOf(r, lh?.title) ?? `Item ${i + 1}`)}</strong></td>${cols.map((col) => `<td style="${CELL};text-align:center">${col === c ? "●" : ""}</td>`).join("")}</tr>`;
      })
      .join("");
    const title = m.title ?? `${this.label(m.rows, m.rows)} by ${this.label(m.cols.split(".").pop() ?? m.cols, m.cols).toLowerCase()}`;
    const rest = cols.length ? Math.floor(72 / cols.length) : 72;
    return heading(2, escapeHtml(title)) + table([28, ...cols.map(() => rest)], `<thead><tr><th style="${HEAD_CELL}"></th>${head}</tr></thead><tbody>${body}</tbody>`);
  }

  document(title: string, comment: string): string {
    const h = this.hints;
    const used = new Set<string>(h.hide ?? []);
    if (h.intro) used.add(h.intro);
    if (h.facts) used.add(h.facts);
    if (!h.title && typeof this.data.title === "string") used.add("title");
    let out = heading(1, this.inline(title));
    if (h.facts && isObj(this.data[h.facts])) {
      const facts = Object.entries(this.data[h.facts] as Obj)
        .filter(([k]) => !k.startsWith("_"))
        .map(([k, v]) => `<strong>${escapeHtml(this.label(k, `${h.facts}.${k}`))}:</strong> ${this.short(v) ?? this.inline(String(v))}`);
      out += `<p style="${P};color:#404040">${facts.join("<br>")}</p>`;
    }
    if (comment && h.comment !== false) {
      out += comment.split("\n").filter((l) => l.trim()).map((l) => `<p style="${NOTE_P}">${this.inline(l)}</p>`).join("");
    }
    if (h.intro && typeof this.data[h.intro] === "string") out += this.prose(this.data[h.intro] as string);
    out += (h.matrix ?? []).map((m) => this.matrix(m)).join("");
    const keys = Object.keys(this.data).filter((k) => !k.startsWith("_") && !used.has(k));
    const ordered = [...(h.order ?? []).filter((k) => keys.includes(k)), ...keys.filter((k) => !(h.order ?? []).includes(k))];
    for (const k of ordered) {
      const v = this.data[k];
      out += heading(2, escapeHtml(this.label(k, k)));
      if (isObj(v) && Object.values(v).length && Object.values(v).every(isObj)) out += this.entries(k, v);
      else if (Array.isArray(v)) out += this.list(v, k, 1, h.lists?.[k]);
      else out += this.block(v, k, 1);
    }
    return out;
  }
}

/** Renders already-parsed data. */
export function renderData(data: unknown, opts: RenderOptions & { comment?: string } = {}): { html: string; title: string } {
  if (!isObj(data)) {
    const title = opts.fallbackTitle ?? "Untitled";
    return { title, html: heading(1, escapeHtml(title)) + new Renderer({}, {}).block(data, "", 0) };
  }
  const hints = readHints(data._view);
  const title = hints.title ?? (typeof data.title === "string" ? data.title : undefined) ?? opts.fallbackTitle ?? "Untitled";
  return { title, html: new Renderer(data, hints).document(title, opts.comment ?? "") };
}

/** Parses YAML text (all documents) and renders the body. Parse errors are reported, not thrown. */
export function renderYaml(text: string, opts: RenderOptions = {}): RenderResult {
  const docs = parseAllDocuments(text);
  const list = Array.isArray(docs) ? docs : [];
  const errors = list.flatMap((d) => d.errors.map((e) => e.message));
  const comment = leadingComment(text);
  const parts = list.map((d, i) => renderData(d.toJS({ maxAliasCount: 1000 }), { ...opts, comment: i === 0 ? comment : undefined }));
  return {
    title: parts[0]?.title ?? opts.fallbackTitle ?? "Untitled",
    html: parts.map((p) => p.html).join("<hr>"),
    errors,
  };
}

/** A whole self-contained page: open it in a browser or Word, upload it to Drive, or select all and paste. */
export function renderPage(text: string, opts: RenderOptions & { source?: string; generated?: string } = {}): { html: string; errors: string[] } {
  const r = renderYaml(text, opts);
  const errors = r.errors.length
    ? `<p style="${P};color:#a00000"><strong>YAML errors:</strong> ${r.errors.map(escapeHtml).join("; ")}</p>`
    : "";
  const footer = opts.source
    ? `<p style="${NOTE_P}">Rendered from ${escapeHtml(opts.source)}${opts.generated ? ` on ${escapeHtml(opts.generated)}` : ""}. Edit the YAML, not this page.</p>`
    : "";
  return {
    errors: r.errors,
    html: `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(r.title)}</title>
</head>
<body style="${FONT};font-size:11pt;line-height:1.4;color:#000000;background:#ffffff;max-width:7.5in;margin:24pt auto;padding:0 16px">
${errors}${r.html}
${footer}
</body>
</html>
`,
  };
}
