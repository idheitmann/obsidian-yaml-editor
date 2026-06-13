/**
 * Pure logic for the YAML-aware Enter key.
 *
 * Given the text of the line the cursor sits at the end of, decide how the
 * next line should begin: how far to indent it, and whether to seed it with a
 * sequence dash. The keymap applies the result; keeping the decision pure
 * makes it straightforward to test.
 */
export interface EnterContinuation {
  /** Number of leading spaces for the new line. */
  newIndent: number;
  /** Text to place after the indent (e.g. "- " to continue a sequence). */
  prefix: string;
}

export function computeEnter(lineText: string): EnterContinuation {
  const indent = leadingSpaces(lineText);
  const trimmed = lineText.trim();

  // Blank lines and comments: keep the current indent, no prefix.
  if (trimmed === "" || trimmed.startsWith("#")) {
    return { newIndent: indent, prefix: "" };
  }

  // Sequence item ("- foo" or a bare "-"): continue the list at the same level.
  if (trimmed === "-" || /^-\s+/.test(trimmed)) {
    return { newIndent: indent, prefix: "- " };
  }

  // A key with no inline value ("key:") opens a nested block: indent one level.
  if (/:\s*$/.test(trimmed)) {
    return { newIndent: indent + 2, prefix: "" };
  }

  // "key: value", scalars, etc.: the next line is a sibling at the same indent.
  return { newIndent: indent, prefix: "" };
}

function leadingSpaces(line: string): number {
  let i = 0;
  while (i < line.length && line.charCodeAt(i) === 32) i++;
  return i;
}
