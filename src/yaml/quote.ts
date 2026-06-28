/**
 * Scalar quoting helpers.
 *
 * The goal is *minimal correct* quoting: quote a plain scalar only when leaving
 * it bare would change how YAML parses it. We deliberately do NOT quote every
 * value containing a `:` or `#` (a literal reading of the spec) because
 * `http://example.com` and `a#b` are valid plain scalars — only `: ` (colon +
 * space) and ` #` (space + hash) actually introduce structure.
 */

const RESERVED = /^(?:y|n|yes|no|true|false|on|off|null|~)$/i;
const LEADING_INDICATOR = /^[!&*?|>%@`"',\]{}#]/;

export function needsQuoting(value: string): boolean {
  if (value === "") return false;
  if (/^\s|\s$/.test(value)) return true; // leading / trailing whitespace
  if (RESERVED.test(value)) return true; // would parse as bool/null
  if (LEADING_INDICATOR.test(value)) return true; // flow / indicator start
  if (/^[-?:](?:\s|$)/.test(value)) return true; // "- ", "? ", ": ", or bare "-"
  if (/:(?:\s|$)/.test(value)) return true; // ": " or trailing ":" => mapping
  if (/\s#/.test(value)) return true; // " #" => comment
  return false;
}

export function isQuoted(value: string): boolean {
  const v = value.trim();
  if (v.length < 2) return false;
  const q = v[0];
  return (q === "'" || q === '"') && v[v.length - 1] === q;
}

export function quoteScalar(value: string): string {
  // Prefer single quotes (only the quote char itself needs escaping, by
  // doubling). Fall back to double quotes when the value contains a single
  // quote, so we don't have to double a forest of them.
  if (!value.includes("'")) return `'${value}'`;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function unquoteScalar(value: string): string {
  const v = value.trim();
  if (!isQuoted(v)) return value;
  const inner = v.slice(1, -1);
  if (v[0] === "'") return inner.replace(/''/g, "'");
  return inner.replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\\\/g, "\\");
}

/** Toggle quoting: unquote if already quoted, otherwise quote. */
export function toggleQuote(value: string): string {
  return isQuoted(value) ? unquoteScalar(value) : quoteScalar(value);
}

export interface ValueSpan {
  /** Column where the value starts. */
  start: number;
  /** Column just past the value (excludes trailing spaces / inline comment). */
  end: number;
  /** The raw value text. */
  value: string;
}

/**
 * Locate the scalar value on a single YAML line — the part after `key: ` or
 * after a `- ` sequence dash. Returns null when there's no scalar to act on
 * (e.g. a bare `key:` opening a block, a comment, or a blank line).
 * For unquoted values, a trailing ` # comment` is excluded from the span.
 */
export function findValueSpan(line: string): ValueSpan | null {
  let m = /^(\s*(?:- )?[^:\n]*:\s+)(\S.*?)\s*$/.exec(line);
  if (!m) m = /^(\s*- )(\S.*?)\s*$/.exec(line);
  if (!m) return null;

  const start = m[1]!.length;
  let value = m[2]!;
  if (!isQuoted(value)) {
    const comment = value.search(/\s#/);
    if (comment >= 0) value = value.slice(0, comment);
  }
  return { start, end: start + value.length, value };
}
