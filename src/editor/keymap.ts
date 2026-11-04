import { App } from "obsidian";
import { EditorView } from "@codemirror/view";
import { history, indentWithTab } from "@codemirror/commands";
import { keymap } from "@codemirror/view";
import { indentUnit } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { computeEnter } from "./indent";
import { yamlRegions } from "./mode";
import { cmInsertDate, cmAddAnchor, cmReferenceAnchor, cmStructural } from "./commands";
import { indentSubtree, moveNode } from "../yaml/structure";

const INDENT = "  "; // two spaces

/** Check whether `pos` is inside any YAML region of the given state. */
function inYamlRegion(state: EditorState, pos: number): boolean {
  for (const r of yamlRegions(state)) {
    if (pos >= r.from && pos <= r.to) return true;
  }
  return false;
}

/**
 * Tab / Shift+Tab: indent only within YAML regions, in 2-space steps. On a key
 * or list-item line the whole subtree moves with it; elsewhere (block-scalar
 * text, comments, blank lines) just the line.
 */
function yamlTab(view: EditorView, forward: boolean): boolean {
  const { state } = view;
  const sel = state.selection.main;

  if (!inYamlRegion(state, sel.head)) return false;

  const region = yamlRegions(state).find((r) => sel.head >= r.from && sel.head <= r.to)!;
  const subtree = indentSubtree(region.text, sel.head - region.from, forward ? "in" : "out", INDENT.length);
  if (subtree) {
    // At the left margin there's nothing to do; let the key fall through.
    if ("error" in subtree && /outermost/.test(subtree.error)) return false;
    // Any other refusal shows its reason and consumes the key, so the default
    // Shift+Tab doesn't outdent just this line and capture the siblings below it.
    return cmStructural(view, () => subtree);
  }

  const line = state.doc.lineAt(sel.head);
  const lineStart = line.from;
  const currentIndent = leadingSpaces(line.text);

  if (forward) {
    // Insert 2 spaces at the start of the line.
    view.dispatch({
      changes: { from: lineStart, to: lineStart, insert: INDENT },
      selection: { anchor: sel.head + 2 },
    });
  } else {
    // Remove up to 2 leading spaces.
    if (currentIndent === 0) return false;
    const remove = Math.min(2, currentIndent);
    view.dispatch({
      changes: { from: lineStart, to: lineStart + remove, insert: "" },
      selection: { anchor: sel.head - remove },
    });
  }
  return true;
}

function leadingSpaces(line: string): number {
  let i = 0;
  while (i < line.length && line.charCodeAt(i) === 32) i++;
  return i;
}

/**
 * Enter inside a YAML region: insert a newline pre-indented to match the
 * structure (continue sequences, open nested blocks). Falls through to the
 * editor default outside YAML regions, on multi-cursor/range selections, or
 * when the cursor isn't at the end of its line.
 */
function yamlEnter(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;
  if (!inYamlRegion(state, sel.head)) return false;

  const line = state.doc.lineAt(sel.head);
  if (sel.head !== line.to) return false; // mid-line Enter → default split

  const { newIndent, prefix } = computeEnter(line.text);
  const insert = "\n" + " ".repeat(newIndent) + prefix;
  view.dispatch({
    changes: { from: sel.head, insert },
    selection: { anchor: sel.head + insert.length },
    scrollIntoView: true,
  });
  return true;
}

/** Default keybindings for the YAML editor. */
export function yamlKeymap(app: App): import("@codemirror/state").Extension {
  return [
    keymap.of([
      {
        key: "Enter",
        run: yamlEnter,
      },
      {
        key: "Tab",
        run(view: EditorView) {
          return yamlTab(view, true);
        },
        shift(view: EditorView) {
          return yamlTab(view, false);
        },
      },
      // Move a key or list item past its sibling, subtree and all. Off a
      // key/item line (or outside YAML) this falls through to the default.
      {
        key: "Alt-ArrowUp",
        run: (view) => cmStructural(view, (t, o) => moveNode(t, o, "up")),
      },
      {
        key: "Alt-ArrowDown",
        run: (view) => cmStructural(view, (t, o) => moveNode(t, o, "down")),
      },
      {
        key: "Mod-Shift-d",
        run: cmInsertDate,
      },
      {
        key: "Mod-Shift-a",
        run: (view) => cmAddAnchor(view, app),
      },
      {
        key: "Mod-Shift-r",
        run: (view) => cmReferenceAnchor(view, app),
      },
      // Default tab behaviour outside YAML regions
      indentWithTab,
    ]),
    history(),
    indentUnit.of("  "),
  ];
}
