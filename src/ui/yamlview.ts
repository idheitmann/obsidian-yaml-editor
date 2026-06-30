import { TextFileView, WorkspaceLeaf, TFile } from "obsidian";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, drawSelection, highlightActiveLine, lineNumbers } from "@codemirror/view";
import { defaultKeymap, historyKeymap } from "@codemirror/commands";
import { codeFolding, foldGutter, foldKeymap, foldState } from "@codemirror/language";
import { yamlEditorExtension } from "../editor/extension";
import { wholeDocYaml } from "../editor/mode";
import { collectFoldPaths, restoreFolds, type FoldEntry } from "../editor/foldstate";
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
 *
 * Fold state (which sections are collapsed) is persisted per file path using
 * YAML-path identity, so it survives external file changes and tab switches
 * even when line numbers shift. See {@link collectFoldPaths}/{@link restoreFolds}.
 */
export class YamlFileView extends TextFileView {
  private editor: EditorView | null = null;
  /** Debounce timer for saving fold state on fold/unfold. */
  private foldSaveTimer: number | null = null;
  /**
   * True while we're programmatically (re)applying persisted folds, so the
   * update listener doesn't mistake the resulting fold changes for a user
   * action and schedule a redundant save.
   */
  private restoringFolds = false;

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
      // First file into a fresh editor: restore from persisted settings.
      this.buildEditor(data);
      this.applyFolds(this.savedFoldsForCurrentFile());
      return;
    }
    if (clear) {
      // `clear` means Obsidian is loading a *different* file into this leaf
      // (per TextFileView's contract). The live folds belong to the old file
      // and must not carry over — load the new file's own saved folds.
      this.replaceDoc(data);
      this.applyFolds(this.savedFoldsForCurrentFile());
      return;
    }
    if (this.editor.state.doc.toString() !== data) {
      // Same file changed externally. Snapshot the live folds *before* the
      // replacement wipes their decorations, then re-apply them — this is
      // independent of the debounced settings write, so a fold made moments
      // before the external edit still survives.
      const live = collectFoldPaths(this.editor);
      this.replaceDoc(data);
      this.applyFolds(live);
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
    this.saveFoldState();
    if (this.foldSaveTimer !== null) clearTimeout(this.foldSaveTimer);
    this.editor?.destroy();
    this.editor = null;
  }

  override async onUnloadFile(file: TFile): Promise<void> {
    // The editor still holds the outgoing file's content here, so capture its
    // folds under that file's path before the leaf switches to another file.
    this.saveFoldState(file.path);
    await super.onUnloadFile(file);
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
          keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap]),
          lineNumbers(),
          // Folding state + gutter. The fold *ranges* come from the foldService
          // in yamlEditorExtension; this provides the UI to act on them. (The
          // Markdown editor reuses Obsidian's own fold machinery instead.)
          codeFolding(),
          foldGutter(),
          drawSelection(),
          highlightActiveLine(),
          obsidianTheme,
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) {
              this.data = u.state.doc.toString();
              this.requestSave();
            }
            // Persist user fold changes (debounced). Comparing decoration-set
            // size catches both folds and unfolds without inspecting effects.
            // Skip while we're re-applying persisted folds ourselves.
            if (!this.restoringFolds) {
              const before = u.startState.field(foldState, false)?.size ?? 0;
              const after = u.state.field(foldState, false)?.size ?? 0;
              if (before !== after) this.scheduleFoldSave();
            }
          }),
        ],
      }),
    });
  }

  // ── Fold-state persistence ──────────────────────────────────────────────

  /** Replace the whole document with `data` (a fold-wiping operation). */
  private replaceDoc(data: string): void {
    if (!this.editor) return;
    this.editor.dispatch({
      changes: { from: 0, to: this.editor.state.doc.length, insert: data },
    });
  }

  /** Persisted folds for the file currently loaded in this view. */
  private savedFoldsForCurrentFile(): FoldEntry[] {
    return this.file ? this.plugin.getSavedFolds(this.file.path) : [];
  }

  /**
   * Re-apply a set of folds to the editor, guarding the save listener so the
   * resulting fold changes aren't mistaken for user actions.
   */
  private applyFolds(entries: FoldEntry[]): void {
    if (!this.editor || entries.length === 0) return;
    this.restoringFolds = true;
    try {
      restoreFolds(this.editor, entries);
    } finally {
      this.restoringFolds = false;
    }
  }

  /**
   * Save the current fold state to plugin settings (fire-and-forget). Defaults
   * to the loaded file; an explicit `path` is used when flushing an outgoing
   * file in {@link onUnloadFile}, before `this.file` changes.
   */
  private saveFoldState(path?: string): void {
    if (!this.editor) return;
    const filePath = path ?? this.file?.path;
    if (!filePath) return;
    this.plugin.setSavedFolds(filePath, collectFoldPaths(this.editor));
  }

  /** Debounced wrapper so rapid fold/unfold doesn't spam settings writes. */
  private scheduleFoldSave(): void {
    if (this.foldSaveTimer !== null) clearTimeout(this.foldSaveTimer);
    this.foldSaveTimer = window.setTimeout(() => {
      this.foldSaveTimer = null;
      this.saveFoldState();
    }, 500);
  }
}
