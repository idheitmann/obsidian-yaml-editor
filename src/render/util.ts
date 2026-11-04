// Shape helpers shared by the renderer. Pure.

export type Obj = Record<string, unknown>;

/** A legend entry other values can point at, e.g. `classes.ic_b2b`. */
export interface RefEntry {
  label: string;
  summary: string;
}

export type RefIndex = Map<string, RefEntry>;

export const TITLE_KEYS = ["name", "title", "label", "id", "key"];
const SUMMARY_KEYS = ["what", "summary", "description", "definition", "law"];

export function isObj(v: unknown): v is Obj {
  return !!v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date);
}

export function isScalar(v: unknown): boolean {
  return v === null || v === undefined || ["string", "number", "boolean"].includes(typeof v) || v instanceof Date;
}

export function humanize(key: string): string {
  const s = key.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
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

export function titleOf(item: unknown, key?: string): string | undefined {
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
 * equal to one of these keys, or a snake_case identifier in text matching
 * one, is shown as the entry's label.
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
      refs.set(key, { label, summary });
    }
  }
  return refs;
}
