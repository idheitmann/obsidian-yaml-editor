// The optional `_view:` block a YAML file can carry to steer the read-only
// view. Every hint is structural (order, layout, which fields lead), never
// domain-specific, so the renderer stays independent of any one schema.
// A file without `_view` still renders with the heuristics in render.ts.

export type ListLayout = "cards" | "table" | "list";

export interface ListHints {
  /** Force a layout for this sequence. */
  as?: ListLayout;
  /** Field holding each item's title. Default: name | title | label | id | key. */
  title?: string;
  /** Item fields (dotted, relative to the item) shown as badges under the title. */
  headline?: string[];
  /** Item fields set as prose, in this order, before the remaining fields. */
  narrative?: string[];
}

export interface MatrixHint {
  title?: string;
  /** Top-level sequence whose items are the rows. */
  rows: string;
  /** Item field (dotted) whose value picks the column. */
  cols: string;
}

export interface ViewHints {
  title?: string;
  /** Top-level field set as prose under the title. */
  intro?: string;
  /** Top-level map shown as a compact facts strip under the title. */
  facts?: string;
  /** Top-level section order; unlisted sections follow in document order. */
  order?: string[];
  hide?: string[];
  /** Display labels for keys, by key name or dotted path. */
  labels?: Record<string, string>;
  /** Per-sequence hints, keyed by top-level key. */
  lists?: Record<string, ListHints>;
  matrix?: MatrixHint[];
  /** Show the leading YAML comment as a note. Default true. */
  comment?: boolean;
}

function strArray(v: unknown): string[] | undefined {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string") return [v];
  return undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** Reads `_view` defensively: unknown or malformed hints are ignored, never fatal. */
export function readHints(raw: unknown): ViewHints {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const hints: ViewHints = {
    title: str(r.title),
    intro: str(r.intro),
    facts: str(r.facts),
    order: strArray(r.order),
    hide: strArray(r.hide),
    comment: typeof r.comment === "boolean" ? r.comment : undefined,
  };
  if (r.labels && typeof r.labels === "object" && !Array.isArray(r.labels)) {
    hints.labels = {};
    for (const [k, v] of Object.entries(r.labels as Record<string, unknown>)) {
      if (typeof v === "string") hints.labels[k] = v;
    }
  }
  if (r.lists && typeof r.lists === "object" && !Array.isArray(r.lists)) {
    hints.lists = {};
    for (const [k, v] of Object.entries(r.lists as Record<string, unknown>)) {
      if (!v || typeof v !== "object" || Array.isArray(v)) continue;
      const l = v as Record<string, unknown>;
      const as = str(l.as);
      hints.lists[k] = {
        as: as === "cards" || as === "table" || as === "list" ? as : undefined,
        title: str(l.title),
        headline: strArray(l.headline),
        narrative: strArray(l.narrative),
      };
    }
  }
  const matrix = Array.isArray(r.matrix) ? r.matrix : r.matrix ? [r.matrix] : [];
  hints.matrix = matrix
    .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
    .filter((m) => typeof m.rows === "string" && typeof m.cols === "string")
    .map((m) => ({ title: str(m.title), rows: m.rows as string, cols: m.cols as string }));
  return hints;
}

/** Reads a dotted path (`class.target`) from a value. */
export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (!cur || typeof cur !== "object" || Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}
