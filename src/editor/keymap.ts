import { App, Notice } from "obsidian";
import { EditorView } from "@codemirror/view";
import { history, indentWithTab } from "@codemirror/commands";
import { keymap } from "@codemirror/view";
import { indentUnit } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { promptForString } from "../ui/prompt";
import { computeEnter } from "./indent";
import { yamlRegions } from "./mode";

const INDENT = "  "; // two spaces

/** Check whether `pos` is inside any YAML region of the given state. */
function inYamlRegion(state: EditorState, pos: number): boolean {
  for (const r of yamlRegions(state)) {
    if (pos >= r.from && pos <= r.to) return true;
  }
  return false;
}

/**
 * Tab / Shift+Tab: indent only within YAML regions, in 2-space steps.
 */
function yamlTab(view: EditorView, forward: boolean): boolean {
  const { state } = view;
  const sel = state.selection.main;

  if (!inYamlRegion(state, sel.head)) return false;

  const line = state.doc.lineAt(sel.head);
  const lineStart = line.from;
  const lineText = line.text;
  const currentIndent = leadingSpaces(lineText);
  const indentChange = forward ? INDENT : " ".repeat(Math.max(0, currentIndent - 2));

  if (!forward && currentIndent === 0) return false;

  const afterIndent = lineStart + currentIndent;
  view.dispatch({
    changes: { from: lineStart, to: afterIndent, insert: indentChange },
    selection: { anchor: sel.head + (forward ? 2 : -2) },
  });
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

/** Insert date snippet: `YYYY-MM-DD`. */
function insertDate(view: EditorView): boolean {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const sel = view.state.selection.main;
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: today },
    selection: { anchor: sel.from + today.length },
  });
  return true;
}

/** Insert an anchor on the current node's value: `&name value`. */
function insertAnchor(view: EditorView, app: App): boolean {
  const sel = view.state.selection.main;
  const line = view.state.doc.lineAt(sel.head);
  const colonIdx = line.text.indexOf(": ");
  if (colonIdx === -1) {
    new Notice("No value on current line to anchor.");
    return true;
  }
  void promptForString(app, { title: "Anchor name", placeholder: "my-anchor" }).then((name) => {
    if (!name) return;
    const valPos = line.from + colonIdx + 2;
    view.dispatch({
      changes: { from: valPos, to: valPos, insert: `&${name} ` },
      selection: { anchor: valPos + name.length + 2 },
    });
  });
  return true;
}

/** Insert an alias reference: `*name`. */
function insertAliasRef(view: EditorView, app: App): boolean {
  const sel = view.state.selection.main;
  void promptForString(app, { title: "Anchor to reference", placeholder: "my-anchor" }).then((name) => {
    if (!name) return;
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: `*${name}` },
      selection: { anchor: sel.from + name.length + 1 },
    });
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
      {
        key: "Mod-Shift-d",
        run: insertDate,
      },
      {
        key: "Mod-Shift-a",
        run: (view) => insertAnchor(view, app),
      },
      {
        key: "Mod-Shift-r",
        run: (view) => insertAliasRef(view, app),
      },
      // Default tab behaviour outside YAML regions
      indentWithTab,
    ]),
    history(),
    indentUnit.of("  "),
  ];
}
