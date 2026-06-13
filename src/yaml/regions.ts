import type { YamlRegion } from "../types";

/**
 * Locate every YAML region in a markdown document:
 *   - the leading frontmatter block delimited by `---` lines
 *   - every fenced code block tagged ```yaml or ```yml
 *
 * We work on the raw string so this is cheap to call from a CodeMirror
 * StateField on every doc change. The result is sorted by `from`.
 */
export function findYamlRegions(doc: string): YamlRegion[] {
  const regions: YamlRegion[] = [];

  const front = findFrontmatter(doc);
  if (front) regions.push(front);

  const blockStart = front ? front.to + 4 /* closing --- + newline */ : 0;
  for (const region of findFencedYaml(doc, blockStart)) {
    regions.push(region);
  }

  regions.sort((a, b) => a.from - b.from);
  return regions;
}

function findFrontmatter(doc: string): YamlRegion | null {
  // Frontmatter must start at offset 0 with `---` followed by EOL.
  if (!doc.startsWith("---")) return null;
  const afterOpen = doc.indexOf("\n", 3);
  if (afterOpen === -1) return null;
  // Anything between `---` and the next `\n` other than whitespace is illegal.
  const openLineTail = doc.slice(3, afterOpen).trim();
  if (openLineTail.length > 0) return null;

  const closing = findClosingDashLine(doc, afterOpen + 1);
  if (closing === -1) return null;

  return {
    kind: "frontmatter",
    from: afterOpen + 1,
    to: closing,
    text: doc.slice(afterOpen + 1, closing),
  };
}

/** Find the start offset of a `---`-only line at or after `from`. */
function findClosingDashLine(doc: string, from: number): number {
  let i = from;
  while (i < doc.length) {
    const eol = doc.indexOf("\n", i);
    const lineEnd = eol === -1 ? doc.length : eol;
    const line = doc.slice(i, lineEnd);
    if (line === "---" || line === "...") return i;
    if (eol === -1) return -1;
    i = eol + 1;
  }
  return -1;
}

const FENCE_RE = /(^|\n)(`{3,}|~{3,})[ \t]*(yaml|yml)\b[^\n]*\n/gi;

function* findFencedYaml(doc: string, fromOffset: number): Iterable<YamlRegion> {
  FENCE_RE.lastIndex = fromOffset;
  let m: RegExpExecArray | null;
  while ((m = FENCE_RE.exec(doc)) !== null) {
    const fenceOpener = m[2]!;
    const info = m[3]!;
    const contentStart = m.index + m[0].length;
    const closeRe = new RegExp(`\\n${fenceOpener}[ \\t]*(?:\\n|$)`);
    const rest = doc.slice(contentStart);
    const closeMatch = closeRe.exec(rest);
    if (!closeMatch) break;
    const contentEnd = contentStart + closeMatch.index;
    yield {
      kind: "codeblock",
      from: contentStart,
      to: contentEnd,
      text: doc.slice(contentStart, contentEnd),
      info,
    };
    FENCE_RE.lastIndex = contentEnd;
  }
}

/** Return the region containing `pos`, or null. */
export function regionAt(regions: YamlRegion[], pos: number): YamlRegion | null {
  for (const r of regions) {
    if (pos >= r.from && pos <= r.to) return r;
  }
  return null;
}
