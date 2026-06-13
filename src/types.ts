/**
 * Cross-cutting types used throughout the plugin.
 */

export type YamlPathSegment = string | number;
export type YamlPath = YamlPathSegment[];

export type YamlValueKind =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "null"
  | "date"
  | "datetime"
  | "list"
  | "map"
  | "alias"
  | "anchor"
  | "unknown";

/** A single YAML region inside a document. */
export interface YamlRegion {
  /** Where in the host doc the YAML text starts (after opening fence/---). */
  from: number;
  /** Where it ends (before closing fence/---). */
  to: number;
  /** Frontmatter or fenced code block. */
  kind: "frontmatter" | "codeblock";
  /** The YAML text the region encloses. */
  text: string;
  /** Optional fenced-block info string (e.g. "yaml" or "yml"). */
  info?: string;
}

/** Schema entry recorded by the SchemaTracker. */
export interface SchemaKeyStat {
  /** Path expressed as a stable key, e.g. "tags[]" or "dataview.project". */
  path: string;
  /** Number of notes/regions that use this key at this path. */
  count: number;
  /** Observed value kinds and their frequencies. */
  kinds: Partial<Record<YamlValueKind, number>>;
  /** A small set of example string values, for value completion. */
  examples: string[];
}

export interface PathProbe {
  /** The structural path to the cursor. Empty array = top of region. */
  path: YamlPath;
  /** Whether the cursor is inside a key, value, or empty position. */
  position: "key" | "value" | "empty";
  /** Indentation level (in spaces) at the cursor's logical level. */
  indent: number;
  /** True if cursor sits inside a sequence item awaiting a value. */
  inSequence: boolean;
}

export interface SnippetTemplate {
  /** Stable id; user keybindings reference this. */
  id: string;
  /** Display label in the palette. */
  label: string;
  /** Short hint shown beside the label. */
  hint?: string;
  /** Tags for grouping ("date", "obsidian", "dataview"). */
  tags: string[];
  /**
   * CodeMirror-style snippet body. `${1:placeholder}` denotes tab stops.
   * `${TODAY}` and `${NOW}` are substituted at insert time.
   */
  body: string;
  /** When true, this snippet inserts a top-level key. */
  topLevel?: boolean;
}
