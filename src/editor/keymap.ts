import { App, Notice } from "obsidian";
import { EditorView } from "@codemirror/view";
import { history, indentWithTab } from "@codemirror/commands";
import { keymap } from "@codemirror/view";
import { indentUnit } from "@codemirror/language";
import { findYamlRegions } from "../yaml/regions";
import { promptForString } from "../ui/prompt";

const INDENT = "  "; // two spaces

/** Check whether `pos` is inside any YAML region of `doc`. */
function inYamlRegion(doc: string, pos: number): boolean {
  const regions = findYamlRegions(doc);
  for (const r of regions) {
    if (pos >= r.from && pos <= r.to) return true;
  }
  return false;
}

/**
 * Tab / Shift+Tab: indent only within YAML regions, in 2-space steps.
 */
function yamlTab(view: EditorView, forward: boolean): boolean {
  const { state } = view;
  const doc = state.doc.toString();
  const sel = state.selection.main;

  if (!inYamlRegion(doc, sel.head)) return false;

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
