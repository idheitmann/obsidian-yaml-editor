import { App, Notice } from "obsidian";
import { EditorView } from "@codemirror/view";
import type { EditorState } from "@codemirror/state";
import { yamlRegions } from "./mode";
import { findValueSpan, toggleQuote } from "../yaml/quote";
import { locateKeyPath } from "../yaml/path";
import { promptForString } from "../ui/prompt";

/**
 * Editor actions implemented against a raw CodeMirror `EditorView` so they work
 * in BOTH editing surfaces: YAML inside a Markdown note and a standalone
 * `.yaml`/`.yml` file (which has no Obsidian `Editor` wrapper). Region detection
 * goes through `yamlRegions(state)`, so the `wholeDocYaml` facet makes the whole
 * standalone document count as YAML automatically.
 */

/** Is `pos` inside any YAML region of this state? */
export function cursorInYaml(state: EditorState, pos: number): boolean {
  return yamlRegions(state).some((r) => pos >= r.from && pos <= r.to);
}

export function cmToggleQuote(view: EditorView): boolean {
  const sel = view.state.selection.main;
  const line = view.state.doc.lineAt(sel.head);
  const span = findValueSpan(line.text);
  if (!span) {
    new Notice("No scalar value on this line to quote.");
    return true;
  }
  view.dispatch({
    changes: {
      from: line.from + span.start,
      to: line.from + span.end,
      insert: toggleQuote(span.value),
    },
  });
  return true;
}

/** Toggle a value between a scalar and an inline list: `x` ⇄ `[x]`. */
export function cmToggleListScalar(view: EditorView): boolean {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const colon = line.text.indexOf(": ");
  if (colon === -1) {
    new Notice("No value on this line to toggle.");
    return true;
  }
  const valStart = colon + 2;
  const value = line.text.slice(valStart).trimEnd();
  if (value === "") {
    new Notice("No value on this line to toggle.");
    return true;
  }
  const replacement =
    value.startsWith("[") && value.endsWith("]")
      ? value.slice(1, -1).trim()
      : `[${value}]`;
  view.dispatch({
    changes: { from: line.from + valStart, to: line.from + valStart + value.length, insert: replacement },
  });
  return true;
}

/** Normalize indentation in the cursor's region to 2-space multiples. No other reformatting. */
export function cmFormatRegion(view: EditorView): boolean {
  const head = view.state.selection.main.head;
  const region = yamlRegions(view.state).find((r) => head >= r.from && head <= r.to);
  if (!region) {
    new Notice("Cursor is not inside a YAML region.");
    return true;
  }
  let modified = false;
  const fixed = region.text.split("\n").map((ln) => {
    const stripped = ln.trimEnd();
    if (stripped === "") return "";
    const indent = leadingSpaces(ln);
    const normalized = indent - (indent % 2);
    if (normalized !== indent) modified = true;
    return " ".repeat(normalized) + stripped.slice(indent);
  });
  if (!modified) return true;
  view.dispatch({ changes: { from: region.from, to: region.to, insert: fixed.join("\n") } });
  return true;
}

/** Move the cursor to a key by dotted path (e.g. `dataview.project`). */
export function cmGotoKey(view: EditorView, key: string): boolean {
  const segments = key.split(".").map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return true;
  for (const region of yamlRegions(view.state)) {
    const local = locateKeyPath(region.text, segments);
    if (local !== null) {
      const pos = region.from + local;
      view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
      view.focus();
      return true;
    }
  }
  new Notice(`Key "${key}" not found in any YAML region.`);
  return true;
}

/** Insert today's date (YYYY-MM-DD) at the cursor. */
export function cmInsertDate(view: EditorView): boolean {
  const today = new Date().toISOString().slice(0, 10);
  const sel = view.state.selection.main;
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: today },
    selection: { anchor: sel.from + today.length },
  });
  return true;
}

/** Add an `&anchor` to the value on the current line. */
export function cmAddAnchor(view: EditorView, app: App): boolean {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const colon = line.text.indexOf(": ");
  if (colon === -1) {
    new Notice("No value on current line to anchor.");
    return true;
  }
  void promptForString(app, { title: "Anchor name", placeholder: "my-anchor" }).then((name) => {
    if (!name) return;
    const valPos = line.from + colon + 2;
    view.dispatch({
      changes: { from: valPos, insert: `&${name} ` },
      selection: { anchor: valPos + name.length + 2 },
    });
  });
  return true;
}

/** Insert an `*alias` reference at the cursor. */
export function cmReferenceAnchor(view: EditorView, app: App): boolean {
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

function leadingSpaces(line: string): number {
  let i = 0;
  while (i < line.length && line.charCodeAt(i) === 32) i++;
  return i;
}
