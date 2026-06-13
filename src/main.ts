import { App, Editor, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import { yamlEditorExtension } from "./editor/extension";
import { SchemaTracker } from "./yaml/schema";
import { insertFrontmatter, insertDate, insertNow, insertAnchor, insertAlias, insertTagsQuickAdd } from "./ui/quickadd";
import { SchemaPaletteModal } from "./ui/palette";
import { findYamlRegions } from "./yaml/regions";
import { locateKeyPath } from "./yaml/path";
import { findValueSpan, toggleQuote } from "./yaml/quote";
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
  schemaDirPath: ".obsidian/yaml-schemas/",
  showGutterIcons: true,
  showGhostText: true,
  showBreadcrumbs: true,
  customSnippets: [],
};

// ── Plugin ────────────────────────────────────────────────────────────────────

export default class YamlEditorPlugin extends Plugin {
  settings: PluginSettings = { ...DEFAULT_SETTINGS };
  schemaTracker!: SchemaTracker;
  statusBarEl?: HTMLElement;
  private schemaCleanup!: () => void;

  override async onload(): Promise<void> {
    await this.loadSettings();

    this.schemaTracker = new SchemaTracker(this.app);
    await this.schemaTracker.initialize();
    this.schemaCleanup = this.schemaTracker.attach();

    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.addClass("yaml-breadcrumb");

    this.registerEditorExtension(yamlEditorExtension(this));

    // ── Commands ────────────────────────────────────────────────────────

    this.addCommand({
      id: "yaml-insert-frontmatter",
      name: "Insert frontmatter",
      editorCallback: (editor) => insertFrontmatter(editor),
    });

    this.addCommand({
      id: "yaml-insert-element",
      name: "YAML: Insert element here…",
      editorCallback: (editor) => new SchemaPaletteModal(this.app, editor, this.schemaTracker, this).open(),
    });

    this.addCommand({
      id: "yaml-toggle-list-scalar",
      name: "YAML: Toggle list/scalar",
      editorCallback: (editor) => {
        const cursor = editor.getCursor();
        const lineText = editor.getLine(cursor.line);
        const trimmed = lineText.trimEnd();
        if (trimmed.endsWith("[]")) {
          // Remove trailing `[]`
          const newText = trimmed.slice(0, -2).trimEnd();
          const from = { line: cursor.line, ch: lineText.length - trimmed.length };
          const to = { line: cursor.line, ch: lineText.length };
          editor.replaceRange(newText, from, to);
        } else {
          const colon = trimmed.indexOf(": ");
          if (colon !== -1) {
            const existingVal = trimmed.slice(colon + 2).trim();
            const from = { line: cursor.line, ch: colon + 2 };
            const to = { line: cursor.line, ch: lineText.length };
            editor.replaceRange(`[${existingVal}]`, from, to);
          }
        }
      },
    });

    this.addCommand({
      id: "yaml-toggle-quotes",
      name: "YAML: Toggle quotes on value",
      editorCallback: (editor) => {
        const cursor = editor.getCursor();
        const offset = editor.posToOffset(cursor);
        const inRegion = findYamlRegions(editor.getValue()).some(
          (r) => offset >= r.from && offset <= r.to,
        );
        if (!inRegion) {
          new Notice("Cursor is not inside a YAML region.");
          return;
        }
        const lineText = editor.getLine(cursor.line);
        const span = findValueSpan(lineText);
        if (!span) {
          new Notice("No scalar value on this line to quote.");
          return;
        }
        editor.replaceRange(
          toggleQuote(span.value),
          { line: cursor.line, ch: span.start },
          { line: cursor.line, ch: span.end },
        );
      },
    });

    this.addCommand({
      id: "yaml-goto-key",
      name: "YAML: Go to key…",
      editorCallback: (editor) => {
        void promptForString(this.app, {
          title: "Go to key",
          placeholder: "e.g. tags, dataview.project",
        }).then((key) => {
          if (key) this.gotoKey(editor, key);
        });
      },
    });

    this.addCommand({
      id: "yaml-add-anchor",
      name: "YAML: Add anchor",
      editorCallback: (editor) => {
        void insertAnchor(this.app, editor);
      },
    });

    this.addCommand({
      id: "yaml-reference-anchor",
      name: "YAML: Reference anchor",
      editorCallback: (editor) => {
        void insertAlias(this.app, editor);
      },
    });

    this.addCommand({
      id: "yaml-format-region",
      name: "YAML: Format YAML region",
      editorCallback: (editor) => {
        const cursor = editor.getCursor();
        const regionStart = this.findYamlRegionStart(editor, cursor.line);
        if (regionStart === null) return;
        const regionEnd = this.findYamlRegionEnd(editor, cursor.line);
        if (regionEnd === null) return;
        const allLines = editor.getValue().split("\n");
        const regionLines = allLines.slice(regionStart, regionEnd + 1);
        let modified = false;
        const fixed: string[] = [];
        for (const ln of regionLines) {
          const stripped = ln.trimEnd();
          if (stripped === "") { fixed.push(""); continue; }
          const indent = leadingSpaces(ln);
          const normalised = indent - (indent % 2);
          if (normalised !== indent) modified = true;
          fixed.push(" ".repeat(normalised) + stripped.trimEnd());
        }
        if (!modified) return;
        const from = { line: regionStart, ch: 0 };
        const lastLine = allLines[regionEnd] ?? "";
        const to = { line: regionEnd, ch: lastLine.length };
        editor.replaceRange(fixed.join("\n") + "\n", from, to);
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
      const data = await super.loadData();
      this.settings = { ...DEFAULT_SETTINGS, ...data };
    } catch {
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  async saveSettings(): Promise<void> {
    await super.saveData(this.settings);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private gotoKey(editor: Editor, key: string): void {
    const segments = key.split(".").map((s) => s.trim()).filter(Boolean);
    if (segments.length === 0) return;
    const doc = editor.getValue();
    for (const region of findYamlRegions(doc)) {
      const local = locateKeyPath(region.text, segments);
      if (local !== null) {
        const pos = editor.offsetToPos(region.from + local);
        editor.setCursor(pos);
        editor.scrollIntoView({ from: pos, to: pos }, true);
        return;
      }
    }
    new Notice(`Key "${key}" not found in any YAML region.`);
  }

  private findYamlRegionStart(editor: Editor, line: number): number | null {
    const docText = editor.getValue();
    if (docText.startsWith("---")) return 1;
    const lines = editor.getValue().split("\n");
    for (let i = line; i >= 0; i--) {
      const t = (lines[i] ?? "").trim();
      if (t.startsWith("```yaml") || t.startsWith("```yml")) return i + 1;
    }
    return null;
  }

  private findYamlRegionEnd(editor: Editor, line: number): number | null {
    const lines = editor.getValue().split("\n");
    for (let i = line; i < lines.length; i++) {
      if ((lines[i] ?? "").trim() === "```") return i - 1;
    }
    return null;
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
    containerEl.createEl("h2", { text: "YAML Editor" });

    new Setting(containerEl)
      .setName("Schema directory")
      .setDesc("Path to JSON Schema files (relative to vault root)")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.schemaDirPath)
          .setPlaceholder(DEFAULT_SETTINGS.schemaDirPath)
          .onChange(async (val) => {
            this.plugin.settings.schemaDirPath = val || DEFAULT_SETTINGS.schemaDirPath;
            await this.plugin.saveSettings();
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

    containerEl.createEl("h3", { text: "Custom Snippets" });

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
          ? Object.assign(document.createElement("textarea"), { placeholder, rows: 2 })
          : Object.assign(document.createElement("input"), { placeholder });
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

// ── Util ─────────────────────────────────────────────────────────────────────

function leadingSpaces(line: string): number {
  let i = 0;
  while (i < line.length && line.charCodeAt(i) === 32) i++;
  return i;
}
