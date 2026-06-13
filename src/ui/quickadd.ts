import { Editor, Notice } from "obsidian";

/**
 * Insert `---` frontmatter at the top of a note that doesn't have any, and put
 * the cursor inside it. Uses the Obsidian Editor API (this is a Markdown-only
 * action — standalone .yaml files have no frontmatter block).
 */
export function insertFrontmatter(editor: Editor): void {
  const docText = editor.getValue();
  if (docText.startsWith("---")) {
    new Notice("Frontmatter already exists.");
    return;
  }
  editor.replaceRange("---\n\n---\n\n", { line: 0, ch: 0 }, { line: 0, ch: 0 });
  editor.setCursor({ line: 2, ch: 0 });
}
