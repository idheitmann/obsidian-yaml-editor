// Inline text: HTML escaping, a small markdown subset, vault paths and
// cross-references. Output uses only inline styles so it survives a paste
// into Word or Google Docs. Pure; no DOM.

import { INLINE_STYLES, type InlineStyle } from "./styles";
import type { RefIndex } from "./util";

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

/**
 * Filename first, folder after it in a muted colour: `Plan.md (projects/X)`.
 * With `pathLinks`, the filename is a link carrying the vault path in
 * `data-yr-path`, for the in-app view to open.
 */
export function renderPath(path: string, note: string | undefined, refs: RefIndex, st: InlineStyle = INLINE_STYLES.inline): string {
  const i = path.lastIndexOf("/");
  const base = escapeHtml(i >= 0 ? path.slice(i + 1) : path);
  const name = st.pathLinks ? `<a href="#" data-yr-path="${escapeHtml(path)}" title="${escapeHtml(path)}">${base}</a>` : base;
  const dir = i >= 0 ? ` <span style="${st.muted}">(${escapeHtml(path.slice(0, i))})</span>` : "";
  return `${name}${dir}${note ? ` ${renderInline(note, refs, st)}` : ""}`;
}

// One pass over the raw text. Each alternative is a token; text between
// tokens is escaped. Code spans come first so nothing inside them is
// interpreted.
//
// No lookbehinds: iOS before 16.4 can't parse them, and the regex is compiled
// at load, so one would break the whole plugin there. Tokens 7 and 9 must not
// start inside a word; renderInline checks the preceding character instead.
const TOKEN = new RegExp(
  [
    "`([^`\\n]+)`", // 1 code
    "\\[\\[([^\\]|\\n]+)(?:\\|([^\\]\\n]+))?\\]\\]", // 2,3 wikilink
    "\\[([^\\]\\n]+)\\]\\((https?:[^)\\s]+)\\)", // 4,5 markdown link
    "\\*\\*((?:[^*\\n]|\\*(?!\\*))+)\\*\\*", // 6 bold (may contain *italic*)
    "\\*([^*\\s][^*\\n]*?)\\*(?![\\w*])", // 7 italic (asterisks only; underscores are identifiers); not after [\w*]
    "(https?:\\/\\/[^\\s)<>\"]+)", // 8 bare url
    "([A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+)(?![\\w/-])", // 9 identifier that may be a ref key; not after [\w./-]
  ].join("|"),
  "g",
);

/**
 * Whether a token 7 or 9 match is preceded by a character that rules it out.
 * Rejecting and resuming one character later is equivalent to the lookbehind:
 * no earlier alternative can start with `*` or a letter where these would.
 */
function blockedByPreceding(m: RegExpExecArray, text: string): boolean {
  const prev = m.index > 0 ? text[m.index - 1] : "";
  if (m[7] !== undefined) return /[\w*]/.test(prev);
  if (m[9] !== undefined) return /[\w./-]/.test(prev);
  return false;
}

export function renderInline(text: string, refs: RefIndex, st: InlineStyle = INLINE_STYLES.inline): string {
  let out = "";
  let last = 0;
  // A fresh regex per call, so recursive calls (bold, italic) don't share
  // lastIndex with this loop.
  const re = new RegExp(TOKEN);
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    if (blockedByPreceding(m, text)) {
      re.lastIndex = m.index + 1;
      continue;
    }
    out += escapeHtml(text.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[1] !== undefined) out += `<span style="${st.mono}">${escapeHtml(m[1])}</span>`;
    else if (m[2] !== undefined) out += escapeHtml((m[3] ?? m[2]).trim());
    else if (m[4] !== undefined && m[5] !== undefined) out += `<a href="${escapeHtml(m[5])}">${escapeHtml(m[4])}</a>`;
    else if (m[6] !== undefined) out += `<strong>${renderInline(m[6], refs, st)}</strong>`;
    else if (m[7] !== undefined) out += `<em>${renderInline(m[7], refs, st)}</em>`;
    else if (m[8] !== undefined) out += `<a href="${escapeHtml(m[8])}">${escapeHtml(m[8])}</a>`;
    else if (m[9] !== undefined) out += escapeHtml(refs.get(m[9])?.label ?? m[9]);
  }
  return out + escapeHtml(text.slice(last));
}
