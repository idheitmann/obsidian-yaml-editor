import { TextFileView, WorkspaceLeaf, sanitizeHTMLToDom, setIcon, type ViewStateResult } from "obsidian";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, drawSelection, highlightActiveLine, lineNumbers } from "@codemirror/view";
import { defaultKeymap, historyKeymap } from "@codemirror/commands";
import { codeFolding, foldGutter, foldKeymap } from "@codemirror/language";
import { yamlEditorExtension } from "../editor/extension";
import { wholeDocYaml } from "../editor/mode";
import { obsidianTheme } from "../editor/theme";
import { yamlContextMenu } from "./menu";
import { renderYaml } from "../render/render";
import { initialMode, type YamlViewMode } from "../render/viewmode";
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
 * A header button toggles a read-only rendered view (src/render/), like
 * Markdown's reading view. The editor stays mounted while hidden, so nothing
 * is lost on switching. Files with a top-level `_view:` block open rendered
 * (setting `renderReports`); a mode the user picked is kept in the pane state.
 */
export class YamlFileView extends TextFileView {
  private editor: EditorView | null = null;
  private renderedEl: HTMLElement | null = null;
  private toggleEl: HTMLElement | null = null;
  private mode: YamlViewMode = "source";
  /** Mode restored from the pane state, applied when the file loads. */
  private savedMode: unknown = undefined;
  private renderTimer: number | null = null;

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

  /** The underlying CodeMirror view, for command handlers. Null while rendered, so editing commands don't act on hidden text. */
  get cmView(): EditorView | null {
    return this.mode === "rendered" ? null : this.editor;
  }

  get viewMode(): YamlViewMode {
    return this.mode;
  }

  override onload(): void {
    super.onload();
    this.toggleEl = this.addAction("book-open", "Show rendered view", () => this.toggleMode());
  }

  // ── Pane state (remembers the mode across restarts) ─────────────────────

  override getState(): Record<string, unknown> {
    return { ...super.getState(), mode: this.mode };
  }

  override async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const mode = (state as { mode?: unknown } | null)?.mode;
    this.savedMode = mode;
    await super.setState(state, result);
    // Same file, new state (e.g. history navigation): apply directly.
    if ((mode === "source" || mode === "rendered") && mode !== this.mode && this.editor) this.setMode(mode);
  }

  // ── Rendered view ───────────────────────────────────────────────────────

  toggleMode(): void {
    this.setMode(this.mode === "rendered" ? "source" : "rendered");
    this.app.workspace.requestSaveLayout();
  }

  private setMode(mode: YamlViewMode): void {
    this.mode = mode;
    const rendered = mode === "rendered";
    if (rendered) this.renderNow();
    if (this.editor) this.editor.dom.style.display = rendered ? "none" : "";
    if (this.renderedEl) this.renderedEl.style.display = rendered ? "" : "none";
    if (this.toggleEl) {
      setIcon(this.toggleEl, rendered ? "pencil" : "book-open");
      this.toggleEl.setAttribute("aria-label", rendered ? "Edit YAML" : "Show rendered view");
    }
    if (!rendered) this.editor?.focus();
  }

  private scheduleRender(): void {
    if (this.mode !== "rendered") return;
    if (this.renderTimer !== null) window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => this.renderNow(), 250);
  }

  private renderNow(): void {
    this.renderTimer = null;
    const el = this.ensureRenderedEl();
    const text = this.getViewData();
    const result = renderYaml(text, { palette: "theme", fallbackTitle: this.file?.basename });
    const scroll = el.scrollTop;
    el.empty();
    const inner = el.createDiv({ cls: "yaml-rendered-inner" });
    if (result.errors.length) {
      inner.createEl("p", { cls: "yaml-rendered-error", text: `YAML errors: ${result.errors.join("; ")}` });
    }
    // The renderer escapes every value; sanitizing is the approved route for HTML in Obsidian anyway.
    inner.appendChild(sanitizeHTMLToDom(result.html));
    el.scrollTop = scroll;
  }

  private ensureRenderedEl(): HTMLElement {
    if (this.renderedEl) return this.renderedEl;
    const el = this.contentEl.createDiv({ cls: "yaml-rendered-view" });
    el.style.display = "none";
    // Vault paths open the note; web links go to the browser instead of navigating the app window.
    this.registerDomEvent(el, "click", (evt) => {
      const a = (evt.target as HTMLElement | null)?.closest("a");
      if (!a) return;
      const vaultPath = a.getAttribute("data-yr-path");
      const href = a.getAttribute("href") ?? "";
      if (vaultPath) {
        evt.preventDefault();
        void this.app.workspace.openLinkText(vaultPath, this.file?.path ?? "", evt.ctrlKey || evt.metaKey);
      } else if (/^https?:/i.test(href)) {
        evt.preventDefault();
        window.open(href);
      }
    });
    this.renderedEl = el;
    return el;
  }

  // ── TextFileView bridge ─────────────────────────────────────────────────

  getViewData(): string {
    return this.editor ? this.editor.state.doc.toString() : this.data;
  }

  setViewData(data: string, clear: boolean): void {
    this.data = data;
    const fresh = !this.editor;
    if (!this.editor) {
      this.buildEditor(data);
    } else if (clear || this.editor.state.doc.toString() !== data) {
      // Replace the document when loading a (different) file into this leaf,
      // or when the file changed on disk.
      this.editor.dispatch({
        changes: { from: 0, to: this.editor.state.doc.length, insert: data },
      });
    }
    if (fresh || clear) {
      this.setMode(initialMode(data, this.plugin.settings.renderReports, this.savedMode));
      this.savedMode = undefined;
    } else {
      this.scheduleRender();
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
    if (this.renderTimer !== null) window.clearTimeout(this.renderTimer);
    this.editor?.destroy();
    this.editor = null;
    this.renderedEl = null;
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
          yamlContextMenu(this.plugin),
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
              this.scheduleRender();
            }
          }),
        ],
      }),
    });
  }
}
