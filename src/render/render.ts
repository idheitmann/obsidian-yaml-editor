// Read-only rendering of a YAML document as an HTML report. Pure: takes text
// or data, returns an HTML string with every value escaped. Knows no schema;
// layout comes from the shape of the data plus the optional `_view` hints
// (see hints.ts and RENDER.md).

import { parseAllDocuments } from "yaml";
import { getPath, readHints, type ListHints, type ViewHints } from "./hints";
import {
  asPath,
  escapeHtml,
  renderInline,
  renderPath,
  renderProse,
  renderRef,
  type InlineContext,
  type LinkResolver,
  type RefIndex,
} from "./inline";

export interface RenderOptions {
  link?: LinkResolver;
  /** Title when neither `_view.title` nor a top-level `title` exists, e.g. the filename. */
  fallbackTitle?: string;
}

export interface RenderResult {
  html: string;
  title: string;
  errors: string[];
}

type Obj = Record<string, unknown>;

const TITLE_KEYS = ["name", "title", "label", "id", "key"];
const SUMMARY_KEYS = ["what", "summary", "description", "definition", "law"];
const LONG_TEXT = 140;
const BADGE_TEXT = 48;

export function isObj(v: unknown): v is Obj {
  return !!v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date);
}

export function humanize(key: string): string {
  const s = key.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";
}

/** The `#` comment lines at the very top of the text, before any content. */
export function leadingComment(text: string): string {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    if (/^\s*#/.test(line)) out.push(line.replace(/^\s*#\s?/, ""));
    else if (/^\s*$/.test(line) || /^---\s*$/.test(line)) {
      if (out.length) break;
    } else break;
  }
  return out.join("\n");
}

function isScalar(v: unknown): boolean {
  return v === null || v === undefined || ["string", "number", "boolean"].includes(typeof v) || v instanceof Date;
}

function titleOf(item: unknown, key?: string): string | undefined {
  if (!isObj(item)) return typeof item === "string" ? item : undefined;
  for (const k of key ? [key] : TITLE_KEYS) {
    const v = item[k];
    if (typeof v === "string" || typeof v === "number") return String(v);
  }
  return undefined;
}

/**
 * Entries that other values can point at: children of a top-level map whose
 * values are all maps (a legend, e.g. `classes:` or `templates:`). A value
 * equal to, or an identifier inside text matching, one of these keys links
 * to the entry.
 */
export function buildRefs(data: Obj): RefIndex {
  const refs: RefIndex = new Map();
  for (const [section, value] of Object.entries(data)) {
    if (section.startsWith("_") || !isObj(value)) continue;
    const entries = Object.entries(value);
    if (!entries.length || !entries.every(([, v]) => isObj(v))) continue;
    for (const [key, entry] of entries) {
      if (refs.has(key)) continue;
      const e = entry as Obj;
      const label = (["label", "title", "name"].map((k) => e[k]).find((v) => typeof v === "string") as string) ?? humanize(key);
      const summary =
        (SUMMARY_KEYS.map((k) => e[k]).find((v) => typeof v === "string") as string | undefined) ??
        (Object.values(e).find((v) => typeof v === "string" && v !== label) as string | undefined) ??
        "";
      refs.set(key, { id: `ref-${slug(section)}-${slug(key)}`, label, summary });
    }
  }
  return refs;
}

class Renderer {
  private ctx: InlineContext;
  constructor(
    private data: Obj,
    private hints: ViewHints,
    refs: RefIndex,
    link?: LinkResolver,
  ) {
    this.ctx = { refs, link };
  }

  label(key: string, path: string): string {
    return this.hints.labels?.[path] ?? this.hints.labels?.[key] ?? humanize(key);
  }

  /** Renders one value. `wide` means it needs the full row width. */
  value(v: unknown, path: string, depth: number, skip: string[] = []): { html: string; wide: boolean } {
    if (v === null || v === undefined || v === "") return { html: `<span class="yr-empty">—</span>`, wide: false };
    if (typeof v === "boolean") return { html: v ? "Yes" : "No", wide: false };
    if (typeof v === "number") return { html: escapeHtml(String(v)), wide: false };
    if (v instanceof Date) return { html: escapeHtml(v.toISOString().slice(0, 10)), wide: false };
    if (typeof v === "string") return this.text(v);
    if (Array.isArray(v)) return { html: this.list(v, path, depth), wide: true };
    if (isObj(v)) return { html: this.fields(v, path, depth, skip), wide: true };
    return { html: escapeHtml(String(v)), wide: false };
  }

  text(v: string): { html: string; wide: boolean } {
    const ref = this.ctx.refs.get(v.trim());
    if (ref) return { html: renderRef(v.trim(), ref), wide: false };
    const p = asPath(v);
    if (p) return { html: renderPath(p.path, p.note, this.ctx), wide: false };
    if (v.length > LONG_TEXT || v.includes("\n")) return { html: `<div class="yr-prose">${renderProse(v, this.ctx)}</div>`, wide: true };
    return { html: renderInline(v, this.ctx), wide: false };
  }

  /** A map as label/value rows. `skip` holds dotted paths, relative to this map, already shown elsewhere. */
  fields(obj: Obj, path: string, depth: number, skip: string[] = []): string {
    const rows: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith("_") || skip.includes(k)) continue;
      const sub = skip.filter((s) => s.startsWith(`${k}.`)).map((s) => s.slice(k.length + 1));
      if (isObj(v) && Object.keys(v).length && Object.keys(v).every((kk) => kk.startsWith("_") || sub.includes(kk))) continue;
      const childPath = path ? `${path}.${k}` : k;
      const { html, wide } = this.value(v, childPath, depth + 1, sub);
      rows.push(
        `<div class="yr-field${wide ? " yr-wide" : ""}"><div class="yr-label">${escapeHtml(this.label(k, childPath))}</div><div class="yr-value">${html}</div></div>`,
      );
    }
    return rows.length ? `<div class="yr-fields">${rows.join("")}</div>` : `<span class="yr-empty">—</span>`;
  }

  tableable(items: unknown[]): boolean {
    if (!items.every(isObj)) return false;
    const keys = new Set(items.flatMap((i) => Object.keys(i as Obj).filter((k) => !k.startsWith("_"))));
    if (keys.size > 6) return false;
    return items.every((i) =>
      Object.values(i as Obj).every((v) => isScalar(v) && String(v ?? "").length <= 80),
    );
  }

  list(items: unknown[], path: string, depth: number, hints?: ListHints): string {
    if (!items.length) return `<span class="yr-empty">—</span>`;
    const objs = items.every(isObj);
    const layout = hints?.as ?? (!objs ? "list" : this.tableable(items) ? "table" : "cards");
    if (layout === "table" && objs) return this.table(items as Obj[], path);
    if (layout === "cards" && objs) return this.cards(items as Obj[], path, depth, hints);
    return `<ul class="yr-list">${items.map((i) => `<li>${this.value(i, path, depth + 1).html}</li>`).join("")}</ul>`;
  }

  table(items: Obj[], path: string): string {
    const keys: string[] = [];
    for (const i of items) for (const k of Object.keys(i)) if (!k.startsWith("_") && !keys.includes(k)) keys.push(k);
    const head = keys.map((k) => `<th>${escapeHtml(this.label(k, `${path}.${k}`))}</th>`).join("");
    const body = items
      .map((i) => `<tr>${keys.map((k) => `<td>${this.value(i[k], `${path}.${k}`, 9).html}</td>`).join("")}</tr>`)
      .join("");
    return `<div class="yr-table-wrap"><table class="yr-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  cardId(path: string, item: Obj, index: number, hints?: ListHints): string {
    return `${slug(path)}-${slug(titleOf(item, hints?.title) ?? String(index + 1))}`;
  }

  badge(label: string, v: unknown): { html: string; truncated: boolean } {
    let text: string;
    let full = "";
    let truncated = false;
    if (typeof v === "string" && this.ctx.refs.has(v.trim())) {
      return { html: `<span class="yr-badge"><span class="yr-badge-label">${escapeHtml(label)}</span>${renderRef(v.trim(), this.ctx.refs.get(v.trim())!)}</span>`, truncated: false };
    }
    if (typeof v === "string") {
      full = v;
      const cut = v.search(/[.;(]\s|,\s/);
      text = cut > 0 && cut < BADGE_TEXT ? v.slice(0, cut) : v.length > BADGE_TEXT ? `${v.slice(0, BADGE_TEXT).trimEnd()}…` : v;
      truncated = text !== v;
    } else {
      text = this.value(v, "", 9).html;
      return { html: `<span class="yr-badge"><span class="yr-badge-label">${escapeHtml(label)}</span>${text}</span>`, truncated };
    }
    return {
      html: `<span class="yr-badge"${truncated ? ` title="${escapeHtml(full)}"` : ""}><span class="yr-badge-label">${escapeHtml(label)}</span>${renderInline(text, this.ctx)}</span>`,
      truncated,
    };
  }

  cards(items: Obj[], path: string, depth: number, hints?: ListHints): string {
    const h = depth <= 1 ? "h3" : "h4";
    return `<div class="yr-cards">${items
      .map((item, i) => {
        const titleKey = hints?.title ?? TITLE_KEYS.find((k) => typeof item[k] === "string" || typeof item[k] === "number");
        const title = titleOf(item, hints?.title) ?? `Item ${i + 1}`;
        const skip: string[] = titleKey ? [titleKey] : [];
        const badges: string[] = [];
        for (const hl of hints?.headline ?? []) {
          const v = getPath(item, hl);
          if (v === undefined) continue;
          const last = hl.split(".").pop() ?? hl;
          const b = this.badge(this.label(last, `${path}.${hl}`), v);
          badges.push(b.html);
          if (!b.truncated) skip.push(hl);
        }
        const narrative: string[] = [];
        for (const np of hints?.narrative ?? []) {
          const v = getPath(item, np);
          if (v === undefined) continue;
          const last = np.split(".").pop() ?? np;
          const body = typeof v === "string" ? renderProse(v, this.ctx) : this.value(v, `${path}.${np}`, depth + 1).html;
          narrative.push(`<div class="yr-narrative"><div class="yr-label">${escapeHtml(this.label(last, `${path}.${np}`))}</div>${body}</div>`);
          skip.push(np);
        }
        return (
          `<article class="yr-card" id="${this.cardId(path, item, i, hints)}">` +
          `<${h} class="yr-card-title">${renderInline(title, this.ctx)}</${h}>` +
          (badges.length ? `<div class="yr-badges">${badges.join("")}</div>` : "") +
          narrative.join("") +
          this.fields(item, path, depth, skip) +
          `</article>`
        );
      })
      .join("")}</div>`;
  }

  /** A top-level map of maps whose children are reference entries. */
  entries(section: string, obj: Obj): string {
    return `<div class="yr-entries">${Object.entries(obj)
      .map(([key, entry]) => {
        const ref = this.ctx.refs.get(key);
        const e = entry as Obj;
        const labelKey = ["label", "title", "name"].find((k) => typeof e[k] === "string");
        const label = labelKey ? String(e[labelKey]) : humanize(key);
        return (
          `<article class="yr-entry" id="${ref?.id ?? `ref-${slug(section)}-${slug(key)}`}">` +
          `<h3 class="yr-entry-title">${renderInline(label, this.ctx)} <code class="yr-key">${escapeHtml(key)}</code></h3>` +
          this.fields(e, `${section}.${key}`, 2, labelKey ? [labelKey] : []) +
          `</article>`
        );
      })
      .join("")}</div>`;
  }

  matrix(m: { title?: string; rows: string; cols: string }, index: number): string {
    const rows = this.data[m.rows];
    if (!Array.isArray(rows)) return "";
    const lh = this.hints.lists?.[m.rows];
    const colOf = (item: unknown): string | undefined => {
      const v = getPath(item, m.cols);
      if (typeof v !== "string") return v === undefined || v === null ? undefined : String(v);
      const lead = /^[A-Za-z0-9_]+/.exec(v.trim())?.[0];
      if (lead && this.ctx.refs.has(lead)) return lead;
      return v.length > 40 ? `${v.slice(0, 40)}…` : v;
    };
    const cols: string[] = [];
    for (const r of rows) {
      const c = colOf(r);
      if (c !== undefined && !cols.includes(c)) cols.push(c);
    }
    const refOrder = [...this.ctx.refs.keys()];
    cols.sort((a, b) => {
      const ia = refOrder.indexOf(a);
      const ib = refOrder.indexOf(b);
      return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
    });
    const colHead = (c: string) => {
      const ref = this.ctx.refs.get(c);
      return ref ? renderRef(c, ref) : renderInline(c, this.ctx);
    };
    const linkRows = (lh?.as ?? (this.tableable(rows) ? "table" : "cards")) === "cards";
    const body = rows
      .map((r, i) => {
        const t = titleOf(r, lh?.title) ?? `Item ${i + 1}`;
        const name = linkRows && isObj(r) ? `<a href="#${this.cardId(m.rows, r, i, lh)}">${escapeHtml(t)}</a>` : escapeHtml(t);
        const c = colOf(r);
        return `<tr><th scope="row">${name}</th>${cols.map((col) => `<td class="yr-cell">${col === c ? `<span class="yr-dot" aria-label="yes">●</span>` : ""}</td>`).join("")}</tr>`;
      })
      .join("");
    const title = m.title ?? `${this.label(m.rows, m.rows)} by ${this.label(m.cols.split(".").pop() ?? m.cols, m.cols).toLowerCase()}`;
    return (
      `<section class="yr-section yr-matrix" id="matrix-${index + 1}"><h2>${renderInline(title, this.ctx)}</h2>` +
      `<div class="yr-table-wrap"><table class="yr-table"><thead><tr><th></th>${cols.map((c) => `<th>${colHead(c)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div></section>`
    );
  }

  section(key: string, v: unknown): { html: string; toc: string } {
    const id = `s-${slug(key)}`;
    const label = this.label(key, key);
    let body: string;
    let sub = "";
    if (isObj(v) && Object.values(v).length && Object.values(v).every(isObj)) {
      body = this.entries(key, v);
    } else if (Array.isArray(v)) {
      const lh = this.hints.lists?.[key];
      body = this.list(v, key, 1, lh);
      const layout = lh?.as ?? (v.every(isObj) ? (this.tableable(v) ? "table" : "cards") : "list");
      if (layout === "cards" && v.every(isObj)) {
        sub = `<ul>${(v as Obj[])
          .map((item, i) => `<li><a href="#${this.cardId(key, item, i, lh)}">${escapeHtml(titleOf(item, lh?.title) ?? `Item ${i + 1}`)}</a></li>`)
          .join("")}</ul>`;
      }
    } else {
      body = this.value(v, key, 1).html;
    }
    return {
      html: `<section class="yr-section" id="${id}"><h2>${escapeHtml(label)}</h2>${body}</section>`,
      toc: `<li><a href="#${id}">${escapeHtml(label)}</a>${sub}</li>`,
    };
  }

  document(title: string, comment: string): string {
    const h = this.hints;
    const used = new Set<string>(h.hide ?? []);
    if (h.intro) used.add(h.intro);
    if (h.facts) used.add(h.facts);
    if (!h.title && typeof this.data.title === "string") used.add("title");

    let head = `<header class="yr-header"><h1>${renderInline(title, this.ctx)}</h1>`;
    if (h.facts && isObj(this.data[h.facts])) {
      const facts = Object.entries(this.data[h.facts] as Obj)
        .filter(([k]) => !k.startsWith("_"))
        .map(([k, v]) => `<span class="yr-fact"><span class="yr-fact-label">${escapeHtml(this.label(k, `${h.facts}.${k}`))}</span> ${this.value(v, `${h.facts}.${k}`, 9).html}</span>`)
        .join("");
      head += `<div class="yr-facts">${facts}</div>`;
    }
    if (comment && h.comment !== false) head += `<div class="yr-note">${comment.split("\n").filter((l) => l.trim()).map((l) => `<p>${renderInline(l, this.ctx)}</p>`).join("")}</div>`;
    if (h.intro && typeof this.data[h.intro] === "string") head += `<div class="yr-intro">${renderProse(this.data[h.intro] as string, this.ctx)}</div>`;
    head += `</header>`;

    const keys = Object.keys(this.data).filter((k) => !k.startsWith("_") && !used.has(k));
    const ordered = [...(h.order ?? []).filter((k) => keys.includes(k)), ...keys.filter((k) => !(h.order ?? []).includes(k))];
    const sections = ordered.map((k) => this.section(k, this.data[k]));
    const matrices = (h.matrix ?? []).map((m, i) => this.matrix(m, i)).filter(Boolean);
    const toc = [
      ...matrices.map((_, i) => `<li><a href="#matrix-${i + 1}">${escapeHtml(h.matrix?.[i]?.title ?? "Summary")}</a></li>`),
      ...sections.map((s) => s.toc),
    ];
    const nav = toc.length > 1 ? `<nav class="yr-toc" aria-label="Contents"><ul>${toc.join("")}</ul></nav>` : "";
    return head + nav + matrices.join("") + sections.map((s) => s.html).join("");
  }
}

/** Renders already-parsed data. */
export function renderData(data: unknown, opts: RenderOptions & { comment?: string } = {}): { html: string; title: string } {
  if (!isObj(data)) {
    const r = new Renderer({}, {}, new Map(), opts.link);
    const title = opts.fallbackTitle ?? "Untitled";
    return { title, html: `<header class="yr-header"><h1>${escapeHtml(title)}</h1></header>${r.value(data, "", 0).html}` };
  }
  const hints = readHints(data._view);
  const refs = buildRefs(data);
  const r = new Renderer(data, hints, refs, opts.link);
  const title = hints.title ?? (typeof data.title === "string" ? data.title : undefined) ?? opts.fallbackTitle ?? "Untitled";
  return { title, html: r.document(title, opts.comment ?? "") };
}

/** Parses YAML text (all documents) and renders it. Parse errors are reported, not thrown. */
export function renderYaml(text: string, opts: RenderOptions = {}): RenderResult {
  const docs = parseAllDocuments(text);
  const list = Array.isArray(docs) ? docs : [];
  const errors = list.flatMap((d) => d.errors.map((e) => e.message));
  if (!list.length) return { html: "", title: opts.fallbackTitle ?? "Untitled", errors };
  const comment = leadingComment(text);
  const parts = list.map((d, i) =>
    renderData(d.toJS({ maxAliasCount: 1000 }), { ...opts, comment: i === 0 ? comment : undefined }),
  );
  return {
    title: parts[0].title,
    html: parts.map((p) => `<div class="yr-docpart">${p.html}</div>`).join(`<hr class="yr-docsep">`),
    errors,
  };
}
