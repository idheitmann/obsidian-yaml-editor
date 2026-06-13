import { EditorView } from "@codemirror/view";
import { findYamlRegions } from "../yaml/regions";
import { probeAt } from "../yaml/path";

/**
 * Returns the indent (in spaces) for the line *after* the cursor when the
 * user presses Enter. Returns `null` when the cursor is not inside a
 * recognised YAML region (meaning the default editor indent applies).
 */
export function nextLineIndent(doc: string, offset: number): number | null {
  const regions = findYamlRegions(doc);
  for (const region of regions) {
    if (offset >= region.from && offset <= region.to) {
      const probe = probeAt(region.text, offset - region.from);
      if (!probe) return null;
      // Sequence items get an extra indent level.
      const base = probe.indent + 2;
      return probe.inSequence ? base + 2 : base;
    }
  }
  return null;
}
