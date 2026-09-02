/**
 * Hanging-indent width for wrapped YAML lines.
 *
 * When a long line soft-wraps, the continuation reads much better if it starts
 * where the line's *content* starts rather than at the left margin — otherwise
 * a wrapped value visually merges with the top-level keys below it. CSS alone
 * can't do this (the width differs per line and CSS can't measure leading
 * whitespace), so the width is computed here and applied as a per-line
 * decoration by [editor/hangingindent.ts].
 *
 * Structural prefixes count as "before the content": the leading spaces, plus
 * each `- ` sequence marker, so a wrapped list item aligns under its own text
 * rather than under its dash.
 */
export function hangWidth(line: string, maxWidth = MAX_HANG): number {
  let i = 0;
  while (i < line.length && line.charCodeAt(i) === 32 /* space */) i++;

  // Whitespace-only lines never wrap, and a tab makes column counting in `ch`
  // units meaningless (YAML forbids tabs for indentation anyway).
  if (i >= line.length || line.charCodeAt(i) === 9 /* tab */) return 0;

  // Nested sequences ("- - item") stack their markers.
  while (line.startsWith("- ", i)) i += 2;

  // Guard against absurd indents from deep nesting or very long dash chains,
  // which would leave almost no room for the wrapped text itself.
  return i > maxWidth ? 0 : i;
}

/** Widest hanging indent we'll apply, in characters. */
export const MAX_HANG = 40;
