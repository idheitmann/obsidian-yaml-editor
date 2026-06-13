import { App, SuggestModal } from "obsidian";
import { EditorView } from "@codemirror/view";
import type { SnippetTemplate } from "../types";
import { expandDatePlaceholders, stripSnippetMarkers } from "../yaml/snippets";
import { yamlRegions } from "../editor/mode";
import { probeAt } from "../yaml/path";
import type { SchemaTracker } from "../yaml/schema";
import YamlEditorPlugin from "../main";

interface PaletteItem {
  label: string;
  hint?: string;
  tags: string[];
  body: string;
}

/**
 * Schema Palette — invoked via Cmd/Ctrl+Shift+Y or the command palette.
 *
 * Shows:
 *   - Keys observed at the current cursor's YAML path
 *   - Built-in Obsidian snippets (created/modified/tags/aliases/cssclasses)
 *   - Dataview field stubs
 *   - Shape snippets (list, map, list-of-maps)
 *   - Anchor / alias
 *   - Custom user snippets from settings
 */
export class SchemaPaletteModal extends SuggestModal<PaletteItem> {
  private view: EditorView;
  private tracker: SchemaTracker;
  private plugin: YamlEditorPlugin;
  private currentPath: string[] = [];

  constructor(app: App, view: EditorView, tracker: SchemaTracker, plugin: YamlEditorPlugin) {
    super(app);
    this.view = view;
    this.tracker = tracker;
    this.plugin = plugin;
    this.emptyStateText = "No matching YAML elements.";
    this.resolvePath();
  }

  private resolvePath(): void {
    const offset = this.view.state.selection.main.head;
    for (const region of yamlRegions(this.view.state)) {
      if (offset >= region.from && offset <= region.to) {
        const probe = probeAt(region.text, offset - region.from);
        if (probe) this.currentPath = probe.path.map(String);
        break;
      }
    }
  }

  override getSuggestions(query: string): PaletteItem[] {
    const items: PaletteItem[] = [];

    // ── 1. Schema keys at current path ──────────────────────────────────
    const path = this.currentPath as import("../types").YamlPath;
    const stats = this.tracker.keysAt(path);
    for (const stat of stats) {
      const keyPart = stat.path.split(".").pop()!.replace(/\[\]$/, "");
      if (!keyPart) continue;
      items.push({
        label: keyPart,
        hint: Object.entries(stat.kinds)
          .filter(([, v]) => v > 0)
          .map(([k]) => k)
          .join(", "),
        tags: ["schema"],
        body: `${keyPart}: `,
      });
    }

    // ── 2. Built-in Obsidian field snippets ────────────────────────────
    items.push(
      { label: "created", hint: "created: <today>", tags: ["obsidian", "date"], body: `created: ${new Date().toISOString().slice(0, 10)}` },
      { label: "modified", hint: "modified: <now>", tags: ["obsidian", "date"], body: `modified: ${new Date().toISOString()}` },
      { label: "tags", hint: "list of tags", tags: ["obsidian"], body: `tags:\n  - ` },
      { label: "aliases", hint: "list of aliases", tags: ["obsidian"], body: `aliases:\n  - ` },
      { label: "cssclasses", hint: "CSS classes", tags: ["obsidian"], body: `cssclasses:\n  - ` },
      { label: "publish", hint: "publish: true/false", tags: ["obsidian"], body: `publish: ` },
    );

    // ── 3. Shape snippets ───────────────────────────────────────────────
    items.push(
      { label: "list", hint: "key: [ items ]", tags: ["shape"], body: `${new Date().toISOString().slice(0, 10)}:\n  - ` },
      { label: "map", hint: "key: { nested }", tags: ["shape"], body: `key:\n  field: value` },
      { label: "list of maps", hint: "key: [ {...}, {...} ]", tags: ["shape"], body: `key:\n  - field: value` },
    );

    // ── 4. Anchor / alias ───────────────────────────────────────────────
    items.push(
      { label: "anchor", hint: "&name value", tags: ["yaml"], body: `&name value` },
      { label: "alias", hint: "*name", tags: ["yaml"], body: `*name` },
    );

    // ── 5. Dataview stubs ──────────────────────────────────────────────
    items.push(
      { label: "project (dataview)", hint: "project link", tags: ["dataview"], body: `project: "[[Project Note]]"` },
      { label: "due (dataview)", hint: "due date", tags: ["dataview", "date"], body: `due: ${new Date().toISOString().slice(0, 10)}` },
      { label: "status (dataview)", hint: "status enum", tags: ["dataview"], body: `status: ` },
      { label: "tags (dataview)", hint: "tag list", tags: ["dataview"], body: `tags: []` },
      { label: "link (dataview)", hint: "note link", tags: ["dataview"], body: `field: [[Note]]` },
    );

    // ── 6. Custom snippets from settings ────────────────────────────────
    for (const snip of this.plugin.settings.customSnippets) {
      items.push({ label: snip.label, hint: snip.hint ?? "", tags: ["custom", ...snip.tags], body: stripSnippetMarkers(expandDatePlaceholders(snip.body)) });
    }

    // Filter by query if provided.
    if (query.trim()) {
      const q = query.toLowerCase();
      return items.filter(
        (item) =>
          item.label.toLowerCase().includes(q) ||
          item.hint?.toLowerCase().includes(q) ||
          item.tags.some((t) => t.includes(q)),
      );
    }
    return items;
  }

  override renderSuggestion(item: PaletteItem, el: HTMLElement): void {
    const container = el.createDiv("yaml-palette-item");

    const label = container.createSpan("yaml-palette-label");
    label.textContent = item.label;

    if (item.hint) {
      const hint = container.createSpan("yaml-palette-hint");
      hint.textContent = item.hint;
    }

    if (item.tags.length > 0) {
      const tags = container.createDiv("yaml-palette-tags");
      for (const tag of item.tags.slice(0, 4)) {
        const badge = tags.createSpan("yaml-tag-badge");
        badge.textContent = tag;
      }
    }
  }

  override onChooseSuggestion(item: PaletteItem, _evt: MouseEvent | KeyboardEvent): void {
    const at = this.view.state.selection.main.head;
    this.view.dispatch({
      changes: { from: at, insert: item.body },
      selection: { anchor: at + item.body.length },
    });
    this.view.focus();
  }

}

