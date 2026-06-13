import type { SnippetTemplate } from "./types";

/**
 * Persisted plugin settings.  Stored via Obsidian's `saveData` / `loadData`
 * as JSON in the plugin's config directory.
 */
export class PluginSettings {
  /** Directory (relative to vault root) that holds JSON Schema files. */
  schemaDirPath: string = ".obsidian/yaml-schemas/";

  /** Show gutter icons (error dots, fold markers). */
  showGutterIcons: boolean = true;

  /** Show ghost-text completion hints at end of lines. */
  showGhostText: boolean = true;

  /** Show YAML path breadcrumb in the status bar. */
  showBreadcrumbs: boolean = true;

  /** User-defined snippet templates, merged with BUILTIN_SNIPPETS. */
  customSnippets: SnippetTemplate[] = [];

  /** Default values (used to reset individual fields). */
  static readonly DEFAULTS: Omit<PluginSettings, keyof typeof PluginSettings.prototype> = {
    schemaDirPath: ".obsidian/yaml-schemas/",
    showGutterIcons: true,
    showGhostText: true,
    showBreadcrumbs: true,
    customSnippets: [],
  };
}
