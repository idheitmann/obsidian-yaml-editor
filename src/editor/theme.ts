import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

/**
 * Make the standalone-file CodeMirror editor follow the active Obsidian theme
 * (light/dark, custom themes) instead of CodeMirror's built-in colors. Both the
 * structural chrome (gutters, cursor, selection, active line) and the syntax
 * token colors are expressed as Obsidian CSS variables, with sensible
 * fallbacks for themes that don't define the `--code-*` set.
 *
 * Syntax colors must live in a HighlightStyle (CodeMirror generates opaque
 * class names that CSS can't target), but the values are still `var(--...)`,
 * so they re-resolve when the theme changes — no rebuild needed.
 */
const obsidianHighlightStyle = HighlightStyle.define([
  { tag: t.comment, color: "var(--code-comment, var(--text-faint))", fontStyle: "italic" },
  {
    tag: [t.propertyName, t.definition(t.propertyName), t.labelName],
    color: "var(--code-property, var(--text-accent))",
  },
  {
    tag: [t.string, t.special(t.string), t.character],
    color: "var(--code-string, var(--text-normal))",
  },
  {
    tag: [t.number, t.bool, t.null, t.atom],
    color: "var(--code-value, var(--text-normal))",
  },
  {
    tag: [t.keyword, t.operator, t.modifier],
    color: "var(--code-keyword, var(--text-accent))",
  },
  { tag: [t.variableName, t.tagName, t.typeName], color: "var(--code-tag, var(--text-accent))" },
  {
    tag: [t.punctuation, t.separator, t.bracket, t.meta],
    color: "var(--code-punctuation, var(--text-muted))",
  },
  { tag: t.invalid, color: "var(--text-error, #e53e3e)" },
]);

const obsidianEditorTheme = EditorView.theme({
  "&": {
    color: "var(--text-normal)",
    backgroundColor: "transparent",
  },
  ".cm-content": {
    fontFamily: "var(--font-monospace)",
    caretColor: "var(--caret-color, var(--text-normal))",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--caret-color, var(--text-normal))",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-line ::selection": {
    backgroundColor: "var(--text-selection)",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--text-faint)",
    border: "none",
  },
  ".cm-activeLine": {
    backgroundColor: "var(--background-modifier-hover)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "var(--text-muted)",
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--background-secondary)",
    color: "var(--text-muted)",
    border: "none",
    padding: "0 4px",
  },
});

/** CodeMirror extensions that theme the editor to match Obsidian. */
export const obsidianTheme: Extension = [
  obsidianEditorTheme,
  syntaxHighlighting(obsidianHighlightStyle, { fallback: true }),
];
