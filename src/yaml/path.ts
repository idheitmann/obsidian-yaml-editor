import type { PathProbe, YamlPath } from "../types";

/**
 * Render a YAML path as a status-bar breadcrumb, e.g.
 * `frontmatter › project › milestones[2] › title`. Sequence indices attach to
 * the preceding key rather than becoming their own crumb.
 */
export function renderBreadcrumb(kind: "frontmatter" | "codeblock", path: YamlPath): string {
  const head = kind === "frontmatter" ? "frontmatter" : "yaml";
  const parts: string[] = [];
  for (const seg of path) {
    if (typeof seg === "number") {
      if (parts.length > 0) parts[parts.length - 1] += `[${seg}]`;
      else parts.push(`[${seg}]`);
    } else {
      parts.push(seg);
    }
  }
  return parts.length > 0 ? `${head} › ${parts.join(" › ")}` : head;
}

/**
 * Resolve the structural YAML path at a cursor offset in a region's text.
 *
 * We don't rely on the AST for this because the cursor is often on an
 * incomplete or blank line that the parser hasn't yet recognised. Instead,
 * we walk the lines preceding the cursor maintaining a stack of
 * `(indent, key)` frames — the same algorithm a human uses when reading
 * indented YAML.
 *
 * The result handles maps and sequences interleaved at any depth. It does
 * not (yet) handle flow-style mappings/sequences inside `{...}`/`[...]`,
 * which is acceptable for frontmatter; flow style is rare there and the
 * caller can fall back to "no path" gracefully.
 */
export function probeAt(text: string, offset: number): PathProbe {
  const lines = splitLines(text);
  const cursor = locateCursor(lines, offset);
  const cursorLine = lines[cursor.line] ?? { text: "", start: 0 };
  const cursorIndent = leadingSpaces(cursorLine.text, cursor.col);

  type Frame = { indent: number; key: string | null; seqIndex: number };
  const stack: Frame[] = [];

  for (let i = 0; i < cursor.line; i++) {
    const raw = lines[i].text;
    if (isBlankOrComment(raw)) continue;

    const indent = leadingSpaces(raw);
    const stripped = raw.slice(indent);

    // Pop frames whose indent is >= this line's indent.
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    if (stripped.startsWith("- ") || stripped === "-") {
      // Sequence item. The frame above us is the parent map/seq.
      const parent = stack[stack.length - 1];
      if (parent && parent.key !== null) {
        // Convert the parent map-key frame into a sequence frame the first
        // time we see one of its items, then advance the index.
        parent.seqIndex = (parent.seqIndex < 0 ? 0 : parent.seqIndex + 1);
      } else {
        // Top-level sequence at indent 0 — push a synthetic frame.
        if (!parent || parent.indent < indent) {
          stack.push({ indent, key: null, seqIndex: 0 });
        }
      }

      // The dash may be followed by an inline `key: value` for a map item.
      const afterDash = stripped.replace(/^-\s+/, "");
      const inlineKey = matchKey(afterDash);
      if (inlineKey) {
        const dashWidth = stripped.length - afterDash.length; // e.g. "- " = 2
        stack.push({
          indent: indent + dashWidth,
          key: inlineKey.key,
          seqIndex: -1,
        });
      }
    } else {
      const km = matchKey(stripped);
      if (km) {
        stack.push({ indent, key: km.key, seqIndex: -1 });
      }
    }
  }

  // Pop frames whose indent >= cursorIndent. Whatever remains is our path.
  while (stack.length > 0 && stack[stack.length - 1].indent >= cursorIndent) {
    stack.pop();
  }

  const path: YamlPath = [];
  for (const f of stack) {
    if (f.key !== null) path.push(f.key);
    if (f.seqIndex >= 0) path.push(f.seqIndex);
  }

  // Determine the position kind from the cursor line.
  const stripped = cursorLine.text.slice(cursorIndent);
  const inSequence =
    stripped.startsWith("- ") ||
    stripped === "-" ||
    stack.some((f) => f.seqIndex >= 0 && f.indent === cursorIndent);
  const km = matchKey(stripped.replace(/^-\s+/, ""));
  let position: PathProbe["position"] = "empty";
  if (km) {
    const colonOffset =
      cursorIndent + (stripped.startsWith("- ") ? 2 : 0) + km.keyEnd;
    position = cursor.col <= colonOffset ? "key" : "value";
  }

  return { path, position, indent: cursorIndent, inSequence };
}

/**
 * Compute the full YAML path of the key on the line at `offset`, including
 * that key itself. Unlike {@link probeAt} (which returns the parent context
 * path), this extends the path with the current line's own key when the line
 * has one.
 *
 * Used for fold-state persistence: the path identifies a foldable line across
 * document edits, even when line numbers shift.
 */
export function pathAtLineStart(text: string, offset: number): YamlPath {
  const probe = probeAt(text, offset);
  const lines = splitLines(text);
  const cursor = locateCursor(lines, offset);
  const cursorLine = lines[cursor.line];
  if (!cursorLine) return probe.path;
  const indent = leadingSpaces(cursorLine.text);
  const stripped = cursorLine.text.slice(indent);
  const dashWidth = stripped.startsWith("- ") ? 2 : stripped === "-" ? 1 : 0;
  const km = matchKey(stripped.slice(dashWidth));
  if (km) return [...probe.path, km.key];
  return probe.path;
}

/**
 * Find the position of a dotted key path (e.g. `dataview.project`) within a
 * region's text, using the same indentation-stack walk as {@link probeAt}.
 * Returns the region-local offset just after the matched key's colon (a good
 * cursor landing spot), or null if no key has exactly that path.
 *
 * Unlike a naive line scan, this respects nesting: `a.b` only matches a `b:`
 * that is actually a child of `a:`, not any `b:` that happens to appear below.
 */
export function locateKeyPath(text: string, segments: string[]): number | null {
  if (segments.length === 0) return null;
  const lines = splitLines(text);
  const stack: { indent: number; key: string }[] = [];

  for (const line of lines) {
    const raw = line.text;
    if (isBlankOrComment(raw)) continue;

    const indent = leadingSpaces(raw);
    const stripped = raw.slice(indent);
    const dashWidth = stripped.startsWith("- ") ? 2 : 0;
    const keyStr = stripped.slice(dashWidth);

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const km = matchKey(keyStr);
    if (!km) continue;

    const path = [...stack.map((f) => f.key), km.key];
    if (pathEquals(path, segments)) {
      return line.start + indent + dashWidth + km.keyEnd + 1;
    }
    stack.push({ indent, key: km.key });
  }
  return null;
}

function pathEquals(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((seg, i) => seg === b[i]);
}

interface LineInfo {
  text: string;
  start: number;
}

function splitLines(text: string): LineInfo[] {
  const out: LineInfo[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) {
      out.push({ text: text.slice(start, i), start });
      start = i + 1;
    }
  }
  out.push({ text: text.slice(start), start });
  return out;
}

function locateCursor(lines: LineInfo[], offset: number): { line: number; col: number } {
  // Binary search would be nicer; linear is fine for region sizes.
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (offset >= l.start && offset <= l.start + l.text.length) {
      return { line: i, col: offset - l.start };
    }
  }
  const last = lines[lines.length - 1];
  return { line: lines.length - 1, col: last.text.length };
}

function leadingSpaces(line: string, max?: number): number {
  const limit = max ?? line.length;
  let i = 0;
  while (i < limit && line.charCodeAt(i) === 32 /* space */) i++;
  return i;
}

function isBlankOrComment(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length === 0 || trimmed.startsWith("#");
}

/**
 * Match a leading `key:` or `"quoted key":` or `'quoted key':` on a line
 * (with content after stripping indent / dash). Returns the unquoted key
 * and the column index at which `:` appears, or null.
 */
function matchKey(s: string): { key: string; keyEnd: number } | null {
  // Quoted key.
  const q = s.match(/^(["'])((?:\\.|(?!\1).)*)\1\s*:/);
  if (q) return { key: q[2], keyEnd: q[0].length - 1 };

  // Plain key — disallow whitespace or YAML structurals before the colon.
  const p = s.match(/^([^\s:#&*![\]{},?][^:#]*?)\s*:(?:\s|$)/);
  if (p) return { key: p[1].trim(), keyEnd: p[0].lastIndexOf(":") };

  return null;
}
