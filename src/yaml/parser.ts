import { Document, parseDocument, isMap, isSeq, isScalar, isAlias } from "yaml";
import type { YamlPath, YamlValueKind } from "../types";

/**
 * Thin wrapper around `eemeli/yaml`. We keep the parsed `Document` so that
 * downstream consumers can walk the AST without reparsing.
 *
 * We always parse with `keepSourceTokens: true` so we can map AST nodes
 * back to byte ranges in the source. That's how the path lookup at a
 * cursor offset works without re-tokenizing.
 */
export interface ParsedRegion {
  doc: Document.Parsed;
  text: string;
  errors: { from: number; to: number; message: string }[];
}

export function parseRegion(text: string): ParsedRegion {
  const doc = parseDocument(text, {
    keepSourceTokens: true,
    prettyErrors: false,
    strict: false,
  });
  const errors = doc.errors.map((e) => {
    const [from = 0, to = from] = e.pos ?? [];
    return { from, to, message: e.message };
  });
  return { doc, text, errors };
}

export function classifyValue(node: unknown): YamlValueKind {
  if (node == null) return "null";
  if (isMap(node)) return "map";
  if (isSeq(node)) return "list";
  if (isAlias(node)) return "alias";
  if (isScalar(node)) {
    const v = node.value;
    if (v === null) return "null";
    if (typeof v === "boolean") return "boolean";
    if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
    if (v instanceof Date) return "datetime";
    if (typeof v === "string") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return "date";
      if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return "datetime";
      return "string";
    }
  }
  return "unknown";
}

/** Render a YamlPath as a stable schema key like `dataview.tasks[].title`. */
export function pathKey(path: YamlPath): string {
  let out = "";
  for (const seg of path) {
    if (typeof seg === "number") out += "[]";
    else out += out.length === 0 ? seg : `.${seg}`;
  }
  return out;
}

/**
 * Render a YamlPath as an **instance** key like `dataview.tasks[2].title`,
 * preserving sequence indices instead of collapsing them to `[]`.
 *
 * Unlike {@link pathKey} (which identifies a *schema slot* shared by every
 * sibling in a sequence), this identifies a *single concrete node*. Use it
 * where two siblings of a sequence must remain distinguishable — e.g.
 * fold-state persistence, where folding `tasks[2]` and `tasks[5]` are
 * different folds.
 */
export function pathInstanceKey(path: YamlPath): string {
  let out = "";
  for (const seg of path) {
    if (typeof seg === "number") out += `[${seg}]`;
    else out += out.length === 0 ? seg : `.${seg}`;
  }
  return out;
}
