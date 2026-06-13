/**
 * Indentation-based folding for YAML regions.
 *
 * Given a region's text and the local offset of a line's start, return the
 * region-local range to fold (from the end of that line to the end of the last
 * more-indented descendant line), or null if the line has no foldable block.
 * Trailing blank lines are not absorbed into the fold.
 */
export function yamlFoldRange(
  text: string,
  lineStartOffset: number,
): { from: number; to: number } | null {
  const lines = splitWithOffsets(text);
  const idx = lines.findIndex((l) => l.from === lineStartOffset);
  if (idx < 0) return null;

  const cur = lines[idx]!;
  const trimmed = cur.text.trim();
  if (trimmed === "" || trimmed.startsWith("#")) return null;

  const base = leadingSpaces(cur.text);
  let endTo: number | null = null;
  for (let i = idx + 1; i < lines.length; i++) {
    const l = lines[i]!;
    if (l.text.trim() === "") continue; // tentatively skip blanks
    if (leadingSpaces(l.text) > base) endTo = l.to;
    else break;
  }

  if (endTo === null) return null;
  return { from: cur.to, to: endTo };
}

interface LineSpan {
  text: string;
  from: number;
  to: number;
}

function splitWithOffsets(text: string): LineSpan[] {
  const out: LineSpan[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) {
      out.push({ text: text.slice(start, i), from: start, to: i });
      start = i + 1;
    }
  }
  out.push({ text: text.slice(start), from: start, to: text.length });
  return out;
}

function leadingSpaces(line: string): number {
  let i = 0;
  while (i < line.length && line.charCodeAt(i) === 32) i++;
  return i;
}
