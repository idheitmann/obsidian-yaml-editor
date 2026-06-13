import { Editor, Notice } from "obsidian";
import { expandDatePlaceholders } from "../yaml/snippets";

/**
 * One-shot insertion helpers for YAML elements.
 * All functions use the Obsidian Editor API (NOT CodeMirror's API).
 */

/** Insert `---` frontmatter at the top of the note. */
export function insertFrontmatter(editor: Editor): void {
  const docText = editor.getValue();
  if (docText.startsWith("---")) {
    new Notice("Frontmatter already exists.");
    return;
  }
  editor.replaceRange("---\n\n---\n\n", { line: 0, ch: 0 }, { line: 0, ch: 0 });
  editor.setCursor({ line: 2, ch: 0 });
}

/** Insert today's date (YYYY-MM-DD) at the cursor. */
export function insertDate(editor: Editor): void {
  const today = new Date().toISOString().slice(0, 10);
  const cursor = editor.getCursor();
  editor.replaceRange(today, cursor, cursor);
  editor.setCursor({ line: cursor.line, ch: cursor.ch + today.length });
}

/** Insert the current ISO datetime at the cursor. */
export function insertNow(editor: Editor): void {
  const now = new Date().toISOString();
  const cursor = editor.getCursor();
  editor.replaceRange(now, cursor, cursor);
  editor.setCursor({ line: cursor.line, ch: cursor.ch + now.length });
}

/**
 * Insert an anchor on the value of the current line.
 * e.g. on `title: My Book` → `title: &mybook My Book`
 */
export function insertAnchor(editor: Editor, nodeKey?: string): void {
  const name = nodeKey ?? window.prompt("Anchor name:");
  if (!name) return;

  const cursor = editor.getCursor();
  const lineText = editor.getLine(cursor.line);
  const colon = lineText.indexOf(": ");
  if (colon === -1) {
    new Notice("No value found on current line to anchor.");
    return;
  }

  const afterColon = lineText.slice(colon + 2);
  const newVal = `&${name} ${afterColon}`;
  const line = cursor.line;
  const from = { line, ch: colon + 2 };
  const to = { line, ch: lineText.length };
  editor.replaceRange(newVal, from, to);
  editor.setCursor({ line, ch: colon + 2 + name.length + 2 });
}

/**
 * Insert an alias reference at the cursor.
 */
export function insertAlias(editor: Editor, anchorName?: string): void {
  const name = anchorName ?? window.prompt("Anchor name to reference:");
  if (!name) return;
  const cursor = editor.getCursor();
  const text = `*${name}`;
  editor.replaceRange(text, cursor, cursor);
  editor.setCursor({ line: cursor.line, ch: cursor.ch + text.length });
}

/**
 * Insert a tags quick-add block: `tags:\n  - `
 */
export function insertTagsQuickAdd(editor: Editor): void {
  const snippet = "tags:\n  - ";
  const cursor = editor.getCursor();
  editor.replaceRange(snippet, cursor, cursor);
  editor.setCursor({ line: cursor.line, ch: cursor.ch + snippet.length });
}

/**
 * Insert a pre-defined snippet body at the cursor.
 */
export function insertSnippet(editor: Editor, snippet: string): void {
  const expanded = expandDatePlaceholders(snippet);
  const cursor = editor.getCursor();
  editor.replaceRange(expanded, cursor, cursor);
  editor.setCursor({ line: cursor.line, ch: cursor.ch + expanded.length });
}
