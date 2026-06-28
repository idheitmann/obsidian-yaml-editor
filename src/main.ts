import { App, MarkdownView, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import { EditorView } from "@codemirror/view";
import { yamlEditorExtension } from "./editor/extension";
import { SchemaTracker } from "./yaml/schema";
import { SchemaStore } from "./yaml/schemastore";
import { insertFrontmatter } from "./ui/quickadd";
import { SchemaPaletteModal } from "./ui/palette";
import { YamlFileView, VIEW_TYPE_YAML } from "./ui/yamlview";
import {
  cursorInYaml,
  cmToggleQuote,
  cmToggleListScalar,
  cmFormatRegion,
  cmGotoKey,
  cmAddAnchor,
  cmReferenceAnchor,
} from "./editor/commands";
import { promptForString } from "./ui/prompt";
import type { SnippetTemplate } from "./types";

// ── Settings interface ───────────────────────────────────────────────────────

interface PluginSettings {
  schemaDirPath: string;
  showGutterIcons: boolean;
  showGhostText: boolean;
  showBreadcrumbs: boolean;
  customSnippets: SnippetTemplate[];
}

const DEFAULT_SETTINGS: PluginSettings = {
  schemaDirPath: "yaml-schemas/",
  showGutterIcons: true,
  showGhostText: true,
  showBreadcrumbs: true,
  customSnippets: [],
};

// ── Plugin ────────────────────────────────────────────────────────────────────

export default class YamlEditorPlugin extends Plugin {
  settings: PluginSettings = { ...DEFAULT_SETTINGS };
  schemaTracker!: SchemaTracker;
  schemaStore!: SchemaStore;
  statusBarEl?: HTMLElement;
  private schemaCleanup!: () => void;

  override async onload(): Promise<void> {
    await this.loadSettings();

    this.schemaTracker = new SchemaTracker(this.app);
    await this.schemaTracker.initialize();
    this.schemaCleanup = this.schemaTracker.attach();

    this.schemaStore = new SchemaStore(this.app, () => this.settings.schemaDirPath);
    await this.schemaStore.reload();

    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.addClass("yaml-breadcrumb");

    this.registerEditorExtension(yamlEditorExtension(this));

    // ── Standalone .yaml / .yml file view ────────────────────────────────
    this.registerView(VIEW_TYPE_YAML, (leaf) => new YamlFileView(leaf, this));
    try {
      this.registerExtensions(["yaml", "yml"], VIEW_TYPE_YAML);
    } catch (e) {
      // Another plugin already owns these extensions; leave them be.
      console.warn("[yaml-editor] could not register .yaml/.yml extensions", e);
    }

    // ── Commands ────────────────────────────────────────────────────────

    this.addCommand({
      id: "yaml-insert-frontmatter",
      name: "Insert frontmatter",
      editorCallback: (editor) => insertFrontmatter(editor),
    });

    // These act on whichever YAML editor is active — a Markdown note's editor
    // or a standalone .yaml/.yml file view — via the underlying CodeMirror view.
    this.addYamlCommand("yaml-insert-element", "YAML: Insert element here…", (view) =>
      new SchemaPaletteModal(this.app, view, this.schemaTracker, this).open(),
    );
    this.addYamlCommand("yaml-toggle-list-scalar", "YAML: Toggle list/scalar", cmToggleListScalar);
    this.addYamlCommand("yaml-toggle-quotes", "YAML: Toggle quotes on value", cmToggleQuote);
    this.addYamlCommand("yaml-format-region", "YAML: Format YAML region", cmFormatRegion);
    this.addYamlCommand("yaml-add-anchor", "YAML: Add anchor", (view) => cmAddAnchor(view, this.app));
    this.addYamlCommand("yaml-reference-anchor", "YAML: Reference anchor", (view) => cmReferenceAnchor(view, this.app));
    this.addYamlCommand("yaml-goto-key", "YAML: Go to key…", (view) => {
      void promptForString(this.app, {
        title: "Go to key",
        placeholder: "e.g. tags, dataview.project",
      }).then((key) => {
        if (key) cmGotoKey(view, key);
      });
    });

    this.addCommand({
      id: "yaml-reload-schemas",
      name: "YAML: Reload schemas",
      callback: async () => {
        const n = await this.schemaStore.reload();
        new Notice(`Loaded ${n} YAML schema${n === 1 ? "" : "s"} from ${this.settings.schemaDirPath}`);
      },
    });

    this.addSettingTab(new YamlEditorSettingTab(this.app, this));

    console.log("[yaml-editor] loaded");
  }

  override onunload(): void {
    this.schemaCleanup?.();
    console.log("[yaml-editor] unloaded");
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  async loadSettings(): Promise<void> {
    try {
      const data = await super.loadData() as Partial<PluginSettings> | null;
      this.settings = { ...DEFAULT_SETTINGS, ...data };
    } catch {
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  async saveSettings(): Promise<void> {
    await super.saveData(this.settings);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** The CodeMirror view of the active YAML editor (Markdown note or .yaml file), or null. */
  private resolveCmView(): EditorView | null {
    const yamlView = this.app.workspace.getActiveViewOfType(YamlFileView);
    if (yamlView?.cmView) return yamlView.cmView;
    const md = this.app.workspace.getActiveViewOfType(MarkdownView);
    const cm = (md?.editor as unknown as { cm?: EditorView } | undefined)?.cm;
    return cm ?? null;
  }

  /**
   * Register a command that runs against the active YAML editor's CodeMirror
   * view. It's only available when the cursor is inside a YAML region, so the
   * commands don't clutter the palette in plain prose.
   */
  private addYamlCommand(id: string, name: string, run: (view: EditorView) => void): void {
    this.addCommand({
      id,
      name,
      checkCallback: (checking) => {
        const view = this.resolveCmView();
        if (!view || !cursorInYaml(view.state, view.state.selection.main.head)) return false;
        if (!checking) run(view);
        return true;
      },
    });
  }
}

// ── Settings tab ─────────────────────────────────────────────────────────────

class YamlEditorSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: YamlEditorPlugin) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Schema directory")
      .setDesc(
        "Folder of JSON Schema (.json) files. A note opts in with a top-level " +
          "`_schema: <name>` key or a `# yaml-schema: <name>` comment, where <name> " +
          "is the file's basename or its $id.",
      )
      .addText((text) =>
        text
          .setValue(this.plugin.settings.schemaDirPath)
          .setPlaceholder(DEFAULT_SETTINGS.schemaDirPath)
          .onChange(async (val) => {
            this.plugin.settings.schemaDirPath = val || DEFAULT_SETTINGS.schemaDirPath;
            await this.plugin.saveSettings();
            await this.plugin.schemaStore.reload();
          }),
      );

    new Setting(containerEl)
      .setName("Show gutter icons")
      .setDesc("Display error dots and fold markers in the editor gutter")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showGutterIcons).onChange(async (val) => {
          this.plugin.settings.showGutterIcons = val;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Show ghost text")
      .setDesc("Show faded completion hints at the end of lines")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showGhostText).onChange(async (val) => {
          this.plugin.settings.showGhostText = val;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Show path breadcrumbs")
      .setDesc("Show the YAML path in the status bar")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showBreadcrumbs).onChange(async (val) => {
          this.plugin.settings.showBreadcrumbs = val;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl).setName("Custom Snippets").setHeading();

    const rebuildSnippets = async () => {
      const rows = containerEl.querySelectorAll<HTMLElement>("[data-snippet-row]");
      const snippets: SnippetTemplate[] = [];
      for (const row of Array.from(rows)) {
        const idEl = row.querySelector<HTMLInputElement>('[data-field="id"]');
        const labelEl = row.querySelector<HTMLInputElement>('[data-field="label"]');
        const hintEl = row.querySelector<HTMLInputElement>('[data-field="hint"]');
        const bodyEl = row.querySelector<HTMLTextAreaElement>('[data-field="body"]');
        const id = idEl?.value?.trim();
        const label = labelEl?.value?.trim();
        const hint = hintEl?.value?.trim();
        const body = bodyEl?.value ?? "";
        if (id && label) {
          snippets.push({ id, label, hint: hint ?? undefined, tags: ["custom"], body });
        }
      }
      this.plugin.settings.customSnippets = snippets;
      await this.plugin.saveSettings();
    };

    const addSnippetRow = (snip?: SnippetTemplate) => {
      const row = containerEl.createDiv("yaml-snippet-row");
      row.setAttribute("data-snippet-row", "true");
      const fields: { key: string; placeholder: string; multiline?: boolean }[] = [
        { key: "id", placeholder: "snippet.id" },
        { key: "label", placeholder: "Display label" },
        { key: "hint", placeholder: "Hint text (optional)" },
        { key: "body", placeholder: "Snippet body\n${1:placeholder} = tab stop\n${TODAY} = today's date", multiline: true },
      ];
      for (const { key, placeholder, multiline } of fields) {
        const el = multiline
          ? Object.assign(activeDocument.createElement("textarea"), { placeholder, rows: 2 })
          : Object.assign(activeDocument.createElement("input"), { placeholder });
        el.setAttribute("data-field", key);
        if (snip && key in snip) {
          (el as HTMLInputElement).value = String((snip as unknown as Record<string, unknown>)[key] ?? "");
        }
        el.addEventListener("input", () => { void rebuildSnippets(); });
        row.appendChild(el);
      }
      new Setting(row).addButton((b) =>
        b.setIcon("trash").setTooltip("Remove").onClick(() => { row.remove(); void rebuildSnippets(); }),
      );
      return row;
    };

    for (const s of this.plugin.settings.customSnippets) {
      addSnippetRow(s);
    }

    new Setting(containerEl).addButton((b) =>
      b.setButtonText("Add snippet").setIcon("plus").onClick(() => addSnippetRow()),
    );
  }
}
