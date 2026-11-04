// Pure decisions behind the rendered view in the standalone YAML file view.

export type YamlViewMode = "source" | "rendered";

/** True when the text has a top-level `_view:` key, i.e. the file declares itself a report. */
export function hasViewBlock(text: string): boolean {
  return /^_view\s*:/m.test(text);
}

/**
 * The mode a freshly opened file starts in: rendered when the setting is on
 * and the file carries a `_view` block, otherwise source. A mode saved in the
 * pane's state (the user toggled it) wins over both.
 */
export function initialMode(text: string, renderReports: boolean, saved?: unknown): YamlViewMode {
  if (saved === "source" || saved === "rendered") return saved;
  return renderReports && hasViewBlock(text) ? "rendered" : "source";
}

/** `folder/Report.yaml` → `folder/Report.html`. */
export function htmlPathFor(yamlPath: string): string {
  return yamlPath.replace(/\.ya?ml$/i, "") + ".html";
}
