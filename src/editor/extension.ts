import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { yaml } from "@codemirror/lang-yaml";
import { linter, lintGutter } from "@codemirror/lint";
import { yamlStateField } from "./state";
import { yamlKeymap } from "./keymap";
import { yamlCompletion } from "./completions";
import { yamlAffordances } from "./affordances";
import { yamlDecorations } from "./decorations";
import YamlEditorPlugin from "../main";

/**
 * Returns the full array of CodeMirror 6 extensions that constitute
 * the YAML Editor plugin's per-editor behaviour.
 *
 * @param plugin - the Obsidian plugin instance (gives access to settings + SchemaTracker)
 */
export function yamlEditorExtension(plugin: YamlEditorPlugin): Extension[] {
  const base: Extension[] = [
    // ── Core YAML support ──────────────────────────────────────────────
    yaml(),
    lintGutter(),

    // ── Our state (regions, probes, parse errors) ─────────────────────
    yamlStateField,

    // ── Autocomplete ───────────────────────────────────────────────────
    yamlCompletion(plugin),

    // ── Visual affordances ─────────────────────────────────────────────
    yamlAffordances(),
    yamlDecorations(),

    // ── Keybindings ────────────────────────────────────────────────────
    yamlKeymap,

    // ── Linter (parse errors surfaced as squiggly underlines) ──────────
    linter(
      (view) => {
        const extState = view.state.field(yamlStateField, false);
        if (!extState) return [];
        const diagnostics: { from: number; to: number; severity: "error"; message: string }[] = [];
        for (const [regionIdx, errors] of extState.parseErrors) {
          const region = extState.regions[regionIdx];
          if (!region) continue;
          for (const err of errors) {
            diagnostics.push({
              from: region.from + err.from,
              to: region.from + err.to,
              severity: "error",
              message: err.message,
            });
          }
        }
        return diagnostics;
      },
      { delay: 150 },
    ),
  ];

  return base;
}
