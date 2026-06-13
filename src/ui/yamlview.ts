import { TextFileView, WorkspaceLeaf } from "obsidian";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, drawSelection, highlightActiveLine, lineNumbers } from "@codemirror/view";
import { defaultKeymap, historyKeymap } from "@codemirror/commands";
import { yamlEditorExtension } from "../editor/extension";
import { wholeDocYaml } from "../editor/mode";
import { obsidianTheme } from "../editor/theme";
import type YamlEditorPlugin from "../main";

export const VIEW_TYPE_YAML = "yaml-editor-view";

/**
 * A view for standalone `.yaml` / `.yml` files. Hosts a CodeMirror 6 editor
 * configured with the same YAML behavior used inside Markdown notes, but with
 * the {@link wholeDocYaml} facet set so the whole document counts as YAML.
 *
 * Extends `TextFileView`, which owns the file lifecycle (load/save/rename);
 * we just bridge its `data` string to and from the CodeMirror document.
 */
export class YamlFileView extends TextFileView {
  private editor: EditorView | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: YamlEditorPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_YAML;
  }

  getIcon(): string {
    return "file-code";
  }

  getDisplayText(): string {
    return this.file?.basename ?? "YAML";
  }

  /** The underlying CodeMirror view, for command handlers. */
  get cmView(): EditorView | null {
    return this.editor;
  }

  // ── TextFileView bridge ─────────────────────────────────────────────────

  getViewData(): string {
    return this.editor ? this.editor.state.doc.toString() : this.data;
  }

  setViewData(data: string, clear: boolean): void {
    this.data = data;
    if (!this.editor) {
      this.buildEditor(data);
      return;
    }
    // Replace the document when loading a (different) file into this leaf.
    if (clear || this.editor.state.doc.toString() !== data) {
      this.editor.dispatch({
        changes: { from: 0, to: this.editor.state.doc.length, insert: data },
      });
    }
  }

  clear(): void {
    this.data = "";
    if (this.editor) {
      this.editor.dispatch({
        changes: { from: 0, to: this.editor.state.doc.length, insert: "" },
      });
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  override async onClose(): Promise<void> {
    this.editor?.destroy();
    this.editor = null;
  }

  private buildEditor(doc: string): void {
    this.contentEl.addClass("yaml-editor-view");
    this.editor = new EditorView({
      parent: this.contentEl,
      state: EditorState.create({
        doc,
        extensions: [
          wholeDocYaml.of(true),
          // Our YAML behavior first, so its Tab/Enter keymap takes precedence
          // over the generic editing fallback below.
          yamlEditorExtension(this.plugin),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          lineNumbers(),
          drawSelection(),
          highlightActiveLine(),
          obsidianTheme,
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) {
              this.data = u.state.doc.toString();
              this.requestSave();
            }
          }),
        ],
      }),
    });
  }
}
