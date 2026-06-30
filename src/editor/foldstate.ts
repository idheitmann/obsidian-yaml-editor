/**
 * Path-based fold-state persistence for standalone `.yaml`/`.yml` files.
 *
 * CodeMirror's fold state (`foldState` from `@codemirror/language`) stores
 * folded ranges as `DecorationSet` — raw document offsets. When a file is
 * reloaded or changed externally, a full document replacement wipes all fold
 * decorations. Line numbers are useless as identity because any edit above
 * shifts them.
 *
 * Instead, we identify a folded section by its **YAML instance path** (e.g.
 * `dataview.milestones` or `tasks[2]`), computed via `pathAtLineStart` and
 * rendered with `pathInstanceKey`. The path is stable across line
 * insertions/deletions elsewhere in the document. Sequence indices are kept
 * (not collapsed to `[]`) so two folded siblings of the same list stay
 * distinct.
 *
 * We intentionally do NOT validate against the foldable line's text: the whole
 * point is to survive external edits, which routinely change the line's value
 * (e.g. `title: Draft` → `title: Final`) without changing its structural path.
 */

import type { EditorView } from "@codemirror/view";
import { foldState, foldEffect } from "@codemirror/language";
import { yamlRegions } from "./mode";
import { yamlFoldRange } from "../yaml/fold";
import { pathAtLineStart } from "../yaml/path";
import { pathInstanceKey } from "../yaml/parser";

/** A single persisted fold, identified by YAML instance path. */
export interface FoldEntry {
  /** Stable YAML instance path (e.g. `"dataview.milestones"`, `"tasks[2]"`). */
  path: string;
}

/**
 * Read the currently-folded ranges from the editor and map each to a
 * path-based identity. Returns entries suitable for persistence.
 */
export function collectFoldPaths(view: EditorView): FoldEntry[] {
  const deco = view.state.field(foldState, false);
  if (!deco || deco.size === 0) return [];

  const entries: FoldEntry[] = [];
  const doc = view.state.doc;
  deco.between(0, doc.length, (from) => {
    // The fold decoration starts at the end of the foldable line (at the
    // newline character). `lineAt(from)` returns the foldable line itself.
    const line = doc.lineAt(from);
    for (const region of yamlRegions(view.state)) {
      if (line.from >= region.from && line.from < region.to) {
        const localOffset = line.from - region.from;
        const path = pathAtLineStart(region.text, localOffset);
        entries.push({ path: pathInstanceKey(path) });
        break;
      }
    }
  });
  return entries;
}

/**
 * Re-apply folded ranges by matching saved path identities against the
 * current document. Called after a document replacement (e.g. external file
 * change) when all fold state has been wiped.
 *
 * Walks each YAML region line by line, computes the path at each foldable
 * line, and dispatches `foldEffect` for matches. This is O(n²) in region
 * size (each `pathAtLineStart` call walks preceding lines), but YAML config
 * files are small and this runs once per reload.
 */
export function restoreFolds(view: EditorView, entries: FoldEntry[]): void {
  if (entries.length === 0) return;

  const state = view.state;
  const regions = yamlRegions(state);
  const wanted = new Set(entries.map((e) => e.path));
  const effects: ReturnType<typeof foldEffect.of>[] = [];

  for (const region of regions) {
    const text = region.text;
    // Walk lines, tracking the local offset of each line start.
    let localStart = 0;
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      const trimmed = lineText.trim();

      // Skip blank/comment lines — they're never fold targets.
      if (trimmed !== "" && !trimmed.startsWith("#")) {
        const key = pathInstanceKey(pathAtLineStart(text, localStart));
        if (wanted.has(key)) {
          const range = yamlFoldRange(text, localStart);
          if (range) {
            effects.push(
              foldEffect.of({
                from: region.from + range.from,
                to: region.from + range.to,
              }),
            );
            // Each instance key is unique to one node; drop it once matched.
            wanted.delete(key);
          }
        }
      }

      localStart += lineText.length + 1; // +1 for the newline
    }
  }

  if (effects.length > 0) {
    view.dispatch({ effects });
  }
}
