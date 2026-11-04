import { matchKey } from "./path";
import { parseRegion } from "./parser";
import { findValueSpan } from "./quote";

/**
 * Structural edits on a YAML region's text: move a node, indent a subtree,
 * sort keys, convert between shapes, find where to insert a key.
 *
 * Every operation is pure and returns a short list of {@link TextEdit}s that
 * touch only the lines it restructures, so everything else (comments, blank
 * lines, quoting, flow style) stays byte-identical. Nothing is re-serialized.
 *
 * Like {@link probeAt}, nodes are found by an indentation walk of the lines,
 * not the AST: a node is a key or list item plus every more-indented line
 * below it (its subtree), plus the comment lines directly above it at the same
 * indent, which travel with it. The AST is used only to check a result: an
 * operation refuses to run on a region that doesn't parse, and sorting or
 * moving a map key refuses if the parsed data would change.
 */

export interface TextEdit {
  from: number;
  to: number;
  insert: string;
}

/** Either the edits to apply (region-local) and where to put the cursor, or why not. */
export type StructuralResult = { edits: TextEdit[]; cursor?: number } | { error: string };

/** Apply non-overlapping edits to `text`. Text outside the edits is copied unchanged. */
export function applyEdits(text: string, edits: TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => a.from - b.from || a.to - b.to);
  let out = "";
  let pos = 0;
  for (const e of sorted) {
    if (e.from < pos || e.to < e.from || e.to > text.length) {
      throw new Error(`Invalid or overlapping edit at ${e.from}-${e.to}`);
    }
    out += text.slice(pos, e.from) + e.insert;
    pos = e.to;
  }
  return out + text.slice(pos);
}

// ── Line model ───────────────────────────────────────────────────────────────

type LineKind = "blank" | "comment" | "key" | "item" | "text" | "marker";

export interface YamlLine {
  from: number;
  to: number;
  text: string;
  indent: number;
  /** `key`: `key:` line. `item`: `- ` line. `text`: block-scalar or other content. `marker`: `---`/`...`. */
  kind: LineKind;
  /** Column of the key on this line (after the dash on an item line), or -1. */
  keyCol: number;
  key: string | null;
  /** Whether that key has a value on this line (anchors, tags and comments don't count). */
  keyHasValue: boolean;
}

export function classifyLines(text: string): YamlLine[] {
  const out: YamlLine[] = [];
  let from = 0;
  // While >= 0, non-blank lines indented deeper than this are block-scalar text.
  let scalarCol = -1;
  for (const t of text.split("\n")) {
    const indent = leadingSpaces(t);
    const line: YamlLine = {
      from,
      to: from + t.length,
      text: t,
      indent,
      kind: "text",
      keyCol: -1,
      key: null,
      keyHasValue: false,
    };
    from = line.to + 1;
    out.push(line);

    if (t.trim() === "") {
      line.kind = "blank";
      continue;
    }
    if (scalarCol >= 0 && indent > scalarCol) continue;
    scalarCol = -1;
    if (t.trimStart().startsWith("#")) {
      line.kind = "comment";
      continue;
    }
    if (indent === 0 && /^(?:---|\.\.\.)(?:\s|$)/.test(t)) {
      line.kind = "marker";
      continue;
    }

    const stripped = t.slice(indent);
    const dash = /^-(?:\s+|$)/.exec(stripped);
    const body = dash ? stripped.slice(dash[0].length) : stripped;
    const km = matchKey(body);
    if (dash) line.kind = "item";
    else if (km) line.kind = "key";
    else continue;

    let value = body;
    if (km) {
      line.keyCol = indent + (dash ? dash[0].length : 0);
      line.key = km.key;
      value = body.slice(km.keyEnd + 1);
      line.keyHasValue = hasInlineValue(value);
    }
    if (isBlockScalarStart(value)) scalarCol = km ? line.keyCol : indent;
  }
  return out;
}

function hasInlineValue(rest: string): boolean {
  const v = rest.replace(/^(?:\s*[&!]\S*)*/, "").trim();
  return v !== "" && !v.startsWith("#");
}

function isBlockScalarStart(value: string): boolean {
  return /^\s*(?:[&!]\S*\s+)*[|>][0-9+-]*\s*(?:#.*)?$/.test(value);
}

// ── Nodes ────────────────────────────────────────────────────────────────────

export interface YamlNode {
  kind: "key" | "item";
  /** Header line index. */
  line: number;
  /** Column where the node starts: the key, or the item's dash. */
  col: number;
  /** Line index just past the subtree. Trailing blank lines are not included. */
  end: number;
  /** First line of the comments attached above the node (== `line` when none). */
  leadStart: number;
  /** A key that shares its line with a list dash (`- key: v`). */
  inline: boolean;
  key: string | null;
}

/** Index of the line containing region-local `offset`. */
export function lineIndexAt(lines: YamlLine[], offset: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lines[mid].from <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * The node whose header is line `i`, or null if line `i` isn't a key or item.
 * On a `- key: v` line, `prefer` picks the item or its first key.
 */
export function headerNodeAt(lines: YamlLine[], i: number, prefer: "key" | "item"): YamlNode | null {
  const l = lines[i];
  if (!l) return null;
  if (l.kind === "key") return makeNode(lines, "key", i, l.indent, false);
  if (l.kind !== "item") return null;
  if (prefer === "key" && l.keyCol >= 0) return makeNode(lines, "key", i, l.keyCol, true);
  return makeNode(lines, "item", i, l.indent, false);
}

/**
 * Like {@link headerNodeAt}, but from a line inside a node (a comment, a
 * continuation, block-scalar text) it finds the node that contains it.
 */
export function nodeAt(lines: YamlLine[], i: number, prefer: "key" | "item"): YamlNode | null {
  const direct = headerNodeAt(lines, i, prefer);
  if (direct) return direct;
  const l = lines[i];
  if (!l || l.kind === "blank" || l.kind === "marker") return null;
  if (l.kind === "comment") {
    // A comment directly above a node at the same indent belongs to it.
    let j = i;
    while (lines[j + 1]?.kind === "comment") j++;
    const next = headerNodeAt(lines, j + 1, prefer);
    if (next && next.col === l.indent && next.leadStart <= i) return next;
  }
  for (let j = i - 1; j >= 0; j--) {
    const h = lines[j];
    if (h.kind === "marker") return null;
    if ((h.kind === "key" || h.kind === "item") && h.indent < l.indent) {
      const node = h.keyCol >= 0 && h.keyCol < l.indent && prefer === "key"
        ? makeNode(lines, "key", j, h.keyCol, h.kind === "item")
        : headerNodeAt(lines, j, h.kind === "item" ? "item" : "key")!;
      return node.end > i ? node : null;
    }
  }
  return null;
}

function makeNode(lines: YamlLine[], kind: "key" | "item", line: number, col: number, inline: boolean): YamlNode {
  const header = lines[line];
  // `key:` with no value can own a compact sequence: `- ` items at its own indent.
  const compact = kind === "key" && !header.keyHasValue;
  let end = line + 1;
  for (let j = line + 1; j < lines.length; j++) {
    const l = lines[j];
    if (l.kind === "blank") continue;
    if (l.kind === "marker") break;
    if (l.indent > col || (compact && l.kind === "item" && l.indent === col)) end = j + 1;
    else break;
  }
  let leadStart = line;
  if (!inline) {
    while (
      leadStart > 0 &&
      lines[leadStart - 1].kind === "comment" &&
      lines[leadStart - 1].indent === col &&
      !isDirective(lines[leadStart - 1].text)
    ) {
      leadStart--;
    }
  }
  return { kind, line, col, end, leadStart, inline, key: kind === "key" ? header.key : null };
}

/** Region-level directives stay put rather than travelling with the first key. */
function isDirective(comment: string): boolean {
  return /^\s*#\s*yaml-schema\s*:/.test(comment);
}

/** The node that directly contains `node`, or null at the top level. */
export function parentOf(lines: YamlLine[], node: YamlNode): YamlNode | null {
  if (node.inline) return makeNode(lines, "item", node.line, lines[node.line].indent, false);
  for (let j = node.line - 1; j >= 0; j--) {
    const l = lines[j];
    if (l.kind === "marker") return null;
    if (l.kind !== "key" && l.kind !== "item") continue;
    if (l.kind === "item" && l.keyCol >= 0) {
      if (l.keyCol < node.col) return makeNode(lines, "key", j, l.keyCol, true);
      if (l.keyCol === node.col && node.kind === "item" && !l.keyHasValue) {
        return makeNode(lines, "key", j, l.keyCol, true);
      }
    }
    if (l.kind === "key" && l.indent === node.col && node.kind === "item" && !l.keyHasValue) {
      return makeNode(lines, "key", j, l.indent, false);
    }
    if (l.indent < node.col) return headerNodeAt(lines, j, l.kind === "item" ? "item" : "key");
  }
  return null;
}

/** `node` and its siblings (same parent, kind and column), in document order. */
export function siblingsOf(lines: YamlLine[], node: YamlNode): YamlNode[] {
  const parent = parentOf(lines, node);
  let start: number;
  let end: number;
  if (parent) {
    start = parent.line;
    end = parent.end;
  } else {
    start = node.line;
    while (start > 0 && lines[start - 1].kind !== "marker") start--;
    end = node.line;
    while (end < lines.length && lines[end].kind !== "marker") end++;
  }
  const out: YamlNode[] = [];
  for (let j = start; j < end; ) {
    const n = nodeWithColAt(lines, j, node.kind, node.col);
    if (n && !(parent && n.line === parent.line && n.col === parent.col && n.kind === parent.kind)) {
      out.push(n);
      j = n.end;
    } else {
      j++;
    }
  }
  return out;
}

function nodeWithColAt(lines: YamlLine[], j: number, kind: "key" | "item", col: number): YamlNode | null {
  const l = lines[j];
  if (kind === "item") return l.kind === "item" && l.indent === col ? makeNode(lines, "item", j, col, false) : null;
  if (l.kind === "key" && l.indent === col) return makeNode(lines, "key", j, col, false);
  if (l.kind === "item" && l.keyCol === col) return makeNode(lines, "key", j, col, true);
  return null;
}

/** First key/item line inside `node`'s subtree, or null if it has none. */
function firstChildLine(lines: YamlLine[], node: YamlNode): YamlLine | null {
  for (let j = node.line + 1; j < node.end; j++) {
    const l = lines[j];
    if (l.kind === "key" || l.kind === "item") return l;
  }
  return null;
}

// ── Slots: moving whole nodes between sibling positions ─────────────────────

/** A sibling's position in the text, and its content split so it can be rendered into another position. */
interface Slot {
  node: YamlNode;
  from: number;
  to: number;
  /** For an inline key: the text before it on its line, e.g. `  - `. */
  prefix: string | null;
  comments: string[];
  header: string;
  rest: string[];
}

function slotOf(lines: YamlLine[], node: YamlNode): Slot {
  const header = lines[node.line];
  return {
    node,
    from: lines[node.leadStart].from,
    to: lines[node.end - 1].to,
    prefix: node.inline ? header.text.slice(0, node.col) : null,
    comments: lines.slice(node.leadStart, node.line).map((l) => l.text),
    header: header.text.slice(node.col),
    rest: lines.slice(node.line + 1, node.end).map((l) => l.text),
  };
}

/** Render `content`'s node into `target`'s position. Returns the text and where its header starts. */
function renderInto(content: Slot, target: Slot): { text: string; headerAt: number } | null {
  let lead: string;
  if (target.prefix !== null) {
    if (content.comments.length > 0) return null; // nowhere to put them on a `- ` line
    lead = target.prefix;
  } else {
    lead = content.comments.map((c) => c + "\n").join("") + " ".repeat(content.node.col);
  }
  const text = [lead + content.header, ...content.rest].join("\n");
  return { text, headerAt: lead.length };
}

const INLINE_COMMENT_ERROR = "Can't move a commented key onto a list item's line.";

// ── Operations ───────────────────────────────────────────────────────────────

const BROKEN = "Fix the YAML errors in this block first.";
const NO_NODE = "Put the cursor on a key or list item.";

/**
 * Move the key or list item on the cursor's line past its previous or next
 * sibling, with its subtree. Returns null when the line isn't a key or item,
 * so the caller can fall back to moving just the line.
 */
export function moveNode(text: string, offset: number, dir: "up" | "down"): StructuralResult | null {
  const lines = classifyLines(text);
  const node = headerNodeAt(lines, lineIndexAt(lines, offset), "item");
  if (!node) return null;
  const before = dataOf(text);
  if (before === null) return { error: BROKEN };
  const sibs = siblingsOf(lines, node);
  const idx = sibs.findIndex((s) => s.line === node.line);
  const other = dir === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || other < 0 || other >= sibs.length) {
    return { error: dir === "up" ? "Already the first item at this level." : "Already the last item at this level." };
  }
  const a = slotOf(lines, sibs[Math.min(idx, other)]);
  const b = slotOf(lines, sibs[Math.max(idx, other)]);
  const bInA = renderInto(b, a);
  const aInB = renderInto(a, b);
  if (!bInA || !aInB) return { error: INLINE_COMMENT_ERROR };
  const gap = text.slice(a.to, b.from);
  const insert = bInA.text + gap + aInB.text;
  const cursor = a.from + (dir === "up" ? bInA.headerAt : bInA.text.length + gap.length + aInB.headerAt);
  const edits = [{ from: a.from, to: b.to, insert }];

  const after = dataOf(applyEdits(text, edits));
  if (after === null || (node.kind === "key" && after !== before)) {
    return { error: "Moving this node would change what the YAML means." };
  }
  return { edits, cursor };
}

/**
 * Tab / Shift+Tab on a key or item line: shift its whole subtree (and its
 * attached comments) by one indent step. Returns null when the line isn't a
 * key or item, so the caller can fall back to indenting just the line.
 *
 * Outdenting is "logical": when siblings follow the node inside its parent,
 * shifting it in place would turn them into the node's children. Instead the
 * node moves to just after the parent's block and becomes the parent's next
 * sibling; the later siblings stay where they were. A last child outdents in
 * place. A logical outdent that wouldn't parse (a key landing in a list, a
 * duplicate key) is refused.
 */
export function indentSubtree(text: string, offset: number, dir: "in" | "out", unit = 2): StructuralResult | null {
  const lines = classifyLines(text);
  const node = headerNodeAt(lines, lineIndexAt(lines, offset), "item");
  if (!node) return null;
  const pad = " ".repeat(unit);
  const edits: TextEdit[] = [];
  for (let j = node.leadStart; j < node.end; j++) {
    const l = lines[j];
    if (l.kind === "blank") continue;
    if (dir === "in") edits.push({ from: l.from, to: l.from, insert: pad });
    else if (l.text.startsWith(pad)) edits.push({ from: l.from, to: l.from + unit, insert: "" });
    else return { error: "Already at the outermost level." };
  }
  if (dir === "in") return { edits };

  const parent = node.inline ? null : parentOf(lines, node);
  if (!parent || !hasLaterSibling(lines, node.end, parent.end)) return { edits };
  return outdentAfterParent(text, lines, node, parent, offset, unit);
}

/** Whether a key or item line follows `nodeEnd` inside the parent's block. */
function hasLaterSibling(lines: YamlLine[], nodeEnd: number, parentEnd: number): boolean {
  for (let j = nodeEnd; j < parentEnd; j++) if (lines[j].kind === "key" || lines[j].kind === "item") return true;
  return false;
}

/** Cut the node out, outdent it, and insert it right after its parent's block. */
function outdentAfterParent(
  text: string,
  lines: YamlLine[],
  node: YamlNode,
  parent: YamlNode,
  offset: number,
  unit: number,
): StructuralResult {
  if (dataOf(text) === null) return { error: BROKEN };
  const blockFrom = lines[node.leadStart].from;
  const blockTo = lines[node.end].from; // a later sibling exists, so node.end is inside the text
  const moved: string[] = [];
  let headerAt = 0;
  for (let j = node.leadStart; j < node.end; j++) {
    if (j === node.line) headerAt = moved.reduce((n, t) => n + t.length + 1, 0);
    const t = lines[j].text;
    moved.push(lines[j].kind === "blank" ? t : t.slice(unit));
  }
  const block = moved.join("\n");
  const atEnd = parent.end >= lines.length;
  const insertAt = atEnd ? text.length : lines[parent.end].from;
  const insert = atEnd ? (text.endsWith("\n") ? "" : "\n") + block : block + "\n";
  const edits: TextEdit[] = [
    { from: blockFrom, to: blockTo, insert: "" },
    { from: insertAt, to: insertAt, insert },
  ];
  if (dataOf(applyEdits(text, edits)) === null) {
    return { error: "Can't outdent this here: the result wouldn't be valid YAML." };
  }
  const column = Math.max(0, offset - lines[node.line].from - unit);
  const lead = atEnd && !text.endsWith("\n") ? 1 : 0;
  const cursor = insertAt - (blockTo - blockFrom) + lead + headerAt + column;
  return { edits, cursor };
}

/** Sort the keys of the mapping containing the cursor, case-insensitively. Comments travel with their keys. */
export function sortKeys(text: string, offset: number): StructuralResult {
  const before = dataOf(text);
  if (before === null) return { error: BROKEN };
  const lines = classifyLines(text);
  const node = nodeAt(lines, lineIndexAt(lines, offset), "key");
  if (!node || node.kind !== "key") return { error: "Put the cursor on a key." };
  const slots = siblingsOf(lines, node).map((n) => slotOf(lines, n));
  const sorted = [...slots].sort((x, y) => compareKeys(x.node.key ?? "", y.node.key ?? ""));
  if (sorted.every((s, k) => s === slots[k])) return { error: "Keys are already sorted." };

  let insert = "";
  for (let k = 0; k < slots.length; k++) {
    const r = renderInto(sorted[k], slots[k]);
    if (!r) return { error: INLINE_COMMENT_ERROR };
    insert += r.text;
    if (k < slots.length - 1) insert += text.slice(slots[k].to, slots[k + 1].from);
  }
  const edits = [{ from: slots[0].from, to: slots[slots.length - 1].to, insert }];
  if (dataOf(applyEdits(text, edits)) !== before) {
    return { error: "Sorting these keys would change what the YAML means." };
  }
  return { edits };
}

function compareKeys(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

/** `key: value` → `key:` with `value` as the first item of a block list under it. */
export function scalarToList(text: string, offset: number): StructuralResult {
  if (dataOf(text) === null) return { error: BROKEN };
  const lines = classifyLines(text);
  const node = nodeAt(lines, lineIndexAt(lines, offset), "key");
  if (!node || node.kind !== "key") return { error: "Put the cursor on a key." };
  const l = lines[node.line];
  const span = findValueSpan(l.text);
  if (!l.keyHasValue || !span || span.start <= node.col) return { error: "This key has no value to turn into a list." };
  if (node.end > node.line + 1) return { error: "Only a single-line value can become a list." };
  if (/^[[{|>]/.test(span.value)) return { error: "Only a plain value can become a list." };

  const comment = l.text.slice(span.end).trim();
  const head = l.text.slice(0, span.start).trimEnd() + (comment ? ` ${comment}` : "");
  const item = " ".repeat(node.col + 2) + "- " + span.value;
  const insert = head + "\n" + item;
  return checked(text, [{ from: l.from, to: l.to, insert }], l.from + insert.length);
}

/**
 * A list under a key → a map. A list of plain values becomes keys with empty
 * values (`- a` → `a:`); a list holding a single map is unwrapped into it.
 */
export function listToMap(text: string, offset: number): StructuralResult {
  if (dataOf(text) === null) return { error: BROKEN };
  const lines = classifyLines(text);
  const node = nodeAt(lines, lineIndexAt(lines, offset), "key");
  if (!node || node.kind !== "key") return { error: "Put the cursor on a key." };
  const first = firstChildLine(lines, node);
  if (lines[node.line].keyHasValue || !first || first.kind !== "item") {
    return { error: "This key doesn't hold a block list." };
  }
  const items = siblingsOf(lines, makeNode(lines, "item", lines.indexOf(first), first.indent, false));
  // A compact list (`- ` at the key's own indent) has to move in a level to become a map.
  const col = Math.max(first.indent, node.col + 2);
  const edits: TextEdit[] = [];

  if (items.length === 1 && first.keyCol >= 0) {
    const item = items[0];
    const shift = first.keyCol - col;
    edits.push({ from: first.from, to: first.from + first.keyCol, insert: " ".repeat(col) });
    for (let j = item.line + 1; j < item.end; j++) {
      const l = lines[j];
      if (l.kind === "blank") continue;
      if (shift > 0) edits.push({ from: l.from, to: l.from + Math.min(shift, l.indent), insert: "" });
      else if (shift < 0) edits.push({ from: l.from, to: l.from, insert: " ".repeat(-shift) });
    }
    return checked(text, edits);
  }

  for (const item of items) {
    const l = lines[item.line];
    const span = findValueSpan(l.text);
    if (item.end > item.line + 1 || l.keyCol >= 0 || !span || /^[[{|>&*!]/.test(span.value)) {
      return { error: "Only a list of plain values, or a list holding a single map, can become a map." };
    }
    const comment = l.text.slice(span.end).trim();
    edits.push({ from: l.from, to: l.to, insert: " ".repeat(col) + span.value + ":" + (comment ? ` ${comment}` : "") });
  }
  return checked(text, edits, undefined, "These values can't all be keys (are some repeated?).");
}

/** A map under a key → a list whose first item is that map, ready for more items. */
export function mapToListOfMaps(text: string, offset: number): StructuralResult {
  if (dataOf(text) === null) return { error: BROKEN };
  const lines = classifyLines(text);
  const node = nodeAt(lines, lineIndexAt(lines, offset), "key");
  if (!node || node.kind !== "key") return { error: "Put the cursor on a key." };
  const first = firstChildLine(lines, node);
  if (lines[node.line].keyHasValue || !first || first.kind !== "key") {
    return { error: "This key doesn't hold a block map." };
  }
  const firstIdx = lines.indexOf(first);
  const edits: TextEdit[] = [{ from: first.from + first.indent, to: first.from + first.indent, insert: "- " }];
  for (let j = firstIdx + 1; j < node.end; j++) {
    const l = lines[j];
    if (l.kind !== "blank") edits.push({ from: l.from, to: l.from, insert: "  " });
  }
  return checked(text, edits);
}

/** Where to start a new key next to (sibling) or under (child) the node at the cursor. */
export function insertKeyPoint(text: string, offset: number, where: "sibling" | "child"): StructuralResult {
  const lines = classifyLines(text);
  const node = nodeAt(lines, lineIndexAt(lines, offset), "key");
  if (!node) return { error: NO_NODE };
  let col = node.col;
  let prefix = node.kind === "item" ? "- " : "";
  if (where === "child") {
    if (node.kind !== "key" || lines[node.line].keyHasValue) {
      return { error: "Only a key without a value on its line can take a child key." };
    }
    const first = firstChildLine(lines, node);
    col = first ? first.indent : node.col + 2;
    prefix = first?.kind === "item" ? "- " : "";
  }
  const at = lines[node.end - 1].to;
  const insert = "\n" + " ".repeat(col) + prefix;
  return { edits: [{ from: at, to: at, insert }], cursor: at + insert.length };
}

/** Accept `edits` only if the result still parses. */
function checked(text: string, edits: TextEdit[], cursor?: number, error = "This conversion would break the YAML."): StructuralResult {
  return dataOf(applyEdits(text, edits)) === null ? { error } : { edits, cursor };
}

// ── Data comparison ──────────────────────────────────────────────────────────

/**
 * Canonical form of the parsed data in `text` (map key order ignored), or
 * null if it doesn't parse cleanly. Two texts with equal results hold the
 * same data.
 */
export function dataOf(text: string): string | null {
  const parsed = parseRegion(text);
  if (parsed.errors.length > 0) return null;
  try {
    return JSON.stringify(parsed.docs.map((d) => canonical(d.toJS({ maxAliasCount: -1 }))));
  } catch {
    return null;
  }
}

function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v instanceof Date) return v.toISOString();
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) out[k] = canonical((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

function leadingSpaces(line: string): number {
  let i = 0;
  while (i < line.length && line.charCodeAt(i) === 32) i++;
  return i;
}
