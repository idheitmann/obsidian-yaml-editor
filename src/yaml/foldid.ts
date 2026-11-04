// Stable identities for folded nodes, so folds survive closing a file,
// switching files and external edits. Pure; no editor state.
//
// A fold is saved as the node it collapses, not its line number:
//
// - `path`: the node's full instance path from the document root, e.g.
//   `tasks[1].sub`, built by walking parents in the line model
//   (src/yaml/structure.ts). Documents after the first are prefixed `#n/`.
// - `fp`: a fingerprint. For a key, its name. For a list item, a short hash of
//   the text that identifies it (the item's own line, or its first content line
//   when the dash stands alone), so an item can be found again after items are
//   inserted above it or the list is reordered.
//
// Restoring matches on path and fingerprint together; failing that, on the
// fingerprint alone among nodes of the same shape (path with list indices
// blanked), but only when exactly one node qualifies. Anything else is dropped
// rather than guessed. Nothing is ever written into the YAML.

import { classifyLines, headerNodeAt, parentOf, siblingsOf, type YamlLine, type YamlNode } from "./structure";

export interface FoldEntry {
  path: string;
  fp: string;
}

/** Identities for every key or list-item line, computed once per text. */
export class FoldIdentities {
  readonly lines: YamlLine[];
  private docIndex: number[] = [];
  private paths = new Map<string, string>();
  private itemIndex = new Map<string, number>();

  constructor(text: string) {
    this.lines = classifyLines(text);
    let doc = 0;
    for (let i = 0; i < this.lines.length; i++) {
      if (this.lines[i].kind === "marker" && i > 0) doc++;
      this.docIndex.push(doc);
    }
  }

  /** The node headed on line `i` (a list item when the line starts with a dash), or null. */
  nodeAt(i: number): YamlNode | null {
    const l = this.lines[i];
    if (!l || (l.kind !== "key" && l.kind !== "item")) return null;
    return headerNodeAt(this.lines, i, "item");
  }

  /** Whether line `i` heads a block the editor can fold (a more-indented line follows). */
  foldable(i: number): boolean {
    const l = this.lines[i];
    if (!l || (l.kind !== "key" && l.kind !== "item")) return false;
    for (let j = i + 1; j < this.lines.length; j++) {
      if (this.lines[j].kind === "blank") continue;
      return this.lines[j].indent > l.indent;
    }
    return false;
  }

  /** The saved identity of the node headed on line `i`, or null. */
  entryAt(i: number): FoldEntry | null {
    const node = this.nodeAt(i);
    return node ? { path: this.pathOf(node), fp: this.fingerprint(node) } : null;
  }

  pathOf(node: YamlNode): string {
    const id = nodeKey(node);
    const cached = this.paths.get(id);
    if (cached !== undefined) return cached;
    const parent = parentOf(this.lines, node);
    let path: string;
    if (node.kind === "item") {
      const seg = `[${this.indexOf(node)}]`;
      path = (parent ? this.pathOf(parent) : this.docPrefix(node)) + seg;
    } else {
      const seg = keySegment(node.key ?? "");
      const base = parent ? this.pathOf(parent) : this.docPrefix(node);
      path = base && !base.endsWith("/") ? `${base}.${seg}` : base + seg;
    }
    this.paths.set(id, path);
    return path;
  }

  fingerprint(node: YamlNode): string {
    if (node.kind === "key") return `k:${node.key ?? ""}`;
    const own = this.lines[node.line].text.trim().replace(/^-\s*/, "");
    let ident = own;
    if (!ident) {
      for (let j = node.line + 1; j < node.end; j++) {
        const l = this.lines[j];
        if (l.kind !== "blank" && l.kind !== "comment") {
          ident = l.text.trim();
          break;
        }
      }
    }
    return `i:${hash(ident)}`;
  }

  private docPrefix(node: YamlNode): string {
    const d = this.docIndex[node.line] ?? 0;
    return d > 0 ? `#${d}/` : "";
  }

  private indexOf(node: YamlNode): number {
    const id = nodeKey(node);
    const known = this.itemIndex.get(id);
    if (known !== undefined) return known;
    siblingsOf(this.lines, node).forEach((s, n) => this.itemIndex.set(nodeKey(s), n));
    return this.itemIndex.get(id) ?? 0;
  }
}

/** Saved identities for the folded lines `lineIndices` of `text`. */
export function foldEntriesFor(text: string, lineIndices: number[]): FoldEntry[] {
  const ids = new FoldIdentities(text);
  const out: FoldEntry[] = [];
  for (const i of lineIndices) {
    const e = ids.entryAt(i);
    if (e) out.push(e);
  }
  return out;
}

/**
 * The line indices of `text` to fold for the saved `entries`. Exact path and
 * fingerprint first; then a unique fingerprint match among nodes of the same
 * shape. Each line is used at most once; unmatched entries are dropped.
 */
export function matchFoldEntries(text: string, entries: FoldEntry[]): number[] {
  if (!entries.length) return [];
  const ids = new FoldIdentities(text);
  const candidates: { line: number; path: string; fp: string; shape: string }[] = [];
  for (let i = 0; i < ids.lines.length; i++) {
    if (!ids.foldable(i)) continue;
    const e = ids.entryAt(i);
    if (e) candidates.push({ line: i, ...e, shape: shapeOf(e.path) });
  }
  const used = new Set<number>();
  const pending: FoldEntry[] = [];
  const out: number[] = [];
  for (const e of entries) {
    const exact = candidates.find((c) => !used.has(c.line) && c.path === e.path && c.fp === e.fp);
    if (exact) {
      used.add(exact.line);
      out.push(exact.line);
    } else pending.push(e);
  }
  for (const e of pending) {
    const shape = shapeOf(e.path);
    const near = candidates.filter((c) => !used.has(c.line) && c.fp === e.fp && c.shape === shape);
    if (near.length === 1) {
      used.add(near[0].line);
      out.push(near[0].line);
    }
  }
  return out.sort((a, b) => a - b);
}

/** A path with list indices blanked: `tasks[3].sub` → `tasks[].sub`. */
export function shapeOf(path: string): string {
  return path.replace(/\[\d+\]/g, "[]");
}

function nodeKey(n: YamlNode): string {
  return `${n.kind}:${n.line}:${n.col}`;
}

function keySegment(key: string): string {
  return /[.[\]/#]/.test(key) ? JSON.stringify(key) : key;
}

/** FNV-1a, 32-bit, as 8 hex digits. Short and stable; not cryptographic. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
