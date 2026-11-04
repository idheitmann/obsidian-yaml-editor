// Inline text rendering for the read-only view: HTML escaping, a small
// markdown subset, links, vault paths and cross-references. Pure; no DOM.

export type LinkKind = "wikilink" | "path" | "url";

/**
 * Turns a link target into an href. Returning null renders the target as
 * plain (non-clickable) text. The standalone page and the Obsidian view
 * supply different resolvers; the renderer itself never guesses URLs for
 * vault paths.
 */
export type LinkResolver = (target: string, kind: LinkKind) => string | null;

/** A named entry another value can point at, e.g. `classes.ic_b2b`. */
export interface RefEntry {
  id: string;
  label: string;
  summary: string;
}

export type RefIndex = Map<string, RefEntry>;

export interface InlineContext {
  link?: LinkResolver;
  refs: RefIndex;
  /** Document mode: no internal anchors or classes, only inline styles. */
  plain?: boolean;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const FILE_EXT = "md|yaml|yml|docx|xlsx|pdf|json|csv|base|html|pptx";

// A whole value that is a vault path, optionally followed by a note in
// parentheses: `projects/X/Workplan.md (decision 4)`.
const PATH_VALUE = new RegExp(`^([^\\n]*?[^\\s/][^\\n]*?\\.(?:${FILE_EXT}))(?:\\s+\\((.+)\\))?$`, "i");

/** Splits a value into a vault path and an optional note, or returns null. */
export function asPath(value: string): { path: string; note?: string } | null {
  const v = value.trim();
  if (v.length > 300) return null;
  const m = PATH_VALUE.exec(v);
  if (!m) return null;
  const path = m[1];
  // Without a folder separator, only accept a short filename-like value, so
  // prose that happens to end in "README.md" isn't mistaken for a path.
  if (!path.includes("/") && (path.split(/\s+/).length > 4 || /[,;:!?]/.test(path))) return null;
  return { path, note: m[2] };
}

export function renderPath(path: string, note: string | undefined, ctx: InlineContext): string {
  if (ctx.plain) {
    const i = path.lastIndexOf("/");
    const dir = i >= 0 ? ` <span style="color:#777777">(${escapeHtml(path.slice(0, i))})</span>` : "";
    return `${escapeHtml(i >= 0 ? path.slice(i + 1) : path)}${dir}${note ? ` ${renderInline(note, ctx)}` : ""}`;
  }
  const slash = path.lastIndexOf("/");
  const dir = slash >= 0 ? path.slice(0, slash + 1) : "";
  const base = slash >= 0 ? path.slice(slash + 1) : path;
  const inner = `<span class="yr-path-base">${escapeHtml(base)}</span>` +
    (dir ? `<span class="yr-path-dir">${escapeHtml(dir)}</span>` : "");
  const href = ctx.link?.(path, "path") ?? null;
  const body = href
    ? `<a class="yr-path" href="${escapeHtml(href)}" title="${escapeHtml(path)}">${inner}</a>`
    : `<span class="yr-path" title="${escapeHtml(path)}">${inner}</span>`;
  return note ? `${body} <span class="yr-path-note">${renderInline(note, ctx)}</span>` : body;
}

export function renderRef(key: string, entry: RefEntry): string {
  return `<a class="yr-ref" href="#${escapeHtml(entry.id)}" title="${escapeHtml(entry.summary || entry.label)}">${escapeHtml(entry.label)}</a>`;
}

// One pass over the raw text. Each alternative is a token; text between
// tokens is escaped. Order matters: code spans first so nothing inside them
// is interpreted.
const TOKEN = new RegExp(
  [
    "`([^`\\n]+)`", // 1 code
    "\\[\\[([^\\]|\\n]+)(?:\\|([^\\]\\n]+))?\\]\\]", // 2,3 wikilink
    "\\[([^\\]\\n]+)\\]\\((https?:[^)\\s]+)\\)", // 4,5 markdown link
    "\\*\\*([^*\\n]+)\\*\\*", // 6 bold
    "(?<![\\w*])\\*([^*\\s][^*\\n]*?)\\*(?![\\w*])", // 7 italic (asterisks only; underscores are identifiers)
    "(https?:\\/\\/[^\\s)<>\"]+)", // 8 bare url
    "(?<![\\w./-])([A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+)(?![\\w/-])", // 9 identifier that may be a ref key
  ].join("|"),
  "g",
);

export function renderInline(text: string, ctx: InlineContext): string {
  let out = "";
  let last = 0;
  // matchAll iterates a copy of the regex, so recursive calls (bold, italic)
  // don't share lastIndex with this loop.
  for (const m of text.matchAll(TOKEN)) {
    out += escapeHtml(text.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[1] !== undefined) {
      out += ctx.plain ? `<span style="font-family:Consolas,monospace">${escapeHtml(m[1])}</span>` : `<code>${escapeHtml(m[1])}</code>`;
    } else if (m[2] !== undefined) {
      const target = m[2].trim();
      const label = (m[3] ?? target).trim();
      const href = ctx.plain ? null : ctx.link?.(target, "wikilink") ?? null;
      out += ctx.plain
        ? escapeHtml(label)
        : href
        ? `<a class="yr-wikilink" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`
        : `<span class="yr-wikilink">${escapeHtml(label)}</span>`;
    } else if (m[4] !== undefined && m[5] !== undefined) {
      out += `<a href="${escapeHtml(m[5])}" rel="noopener">${escapeHtml(m[4])}</a>`;
    } else if (m[6] !== undefined) {
      out += `<strong>${renderInline(m[6], ctx)}</strong>`;
    } else if (m[7] !== undefined) {
      out += `<em>${renderInline(m[7], ctx)}</em>`;
    } else if (m[8] !== undefined) {
      const href = ctx.link?.(m[8], "url") ?? m[8];
      out += `<a href="${escapeHtml(href)}" rel="noopener">${escapeHtml(m[8])}</a>`;
    } else if (m[9] !== undefined) {
      const entry = ctx.refs.get(m[9]);
      out += entry ? (ctx.plain ? escapeHtml(entry.label) : renderRef(m[9], entry)) : escapeHtml(m[9]);
    }
  }
  out += escapeHtml(text.slice(last));
  return out;
}

/** Block text: paragraphs on blank lines, "- " lines as a bullet list. */
export function renderProse(text: string, ctx: InlineContext): string {
  const blocks = text.trim().split(/\n\s*\n/);
  return blocks
    .map((block) => {
      const lines = block.split("\n");
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        return `<ul>${lines.map((l) => `<li>${renderInline(l.replace(/^\s*[-*]\s+/, ""), ctx)}</li>`).join("")}</ul>`;
      }
      return `<p>${renderInline(lines.join(" "), ctx)}</p>`;
    })
    .join("");
}
