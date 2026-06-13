import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { yaml } from "@codemirror/lang-yaml";
import { foldService } from "@codemirror/language";
import { linter, lintGutter } from "@codemirror/lint";
import { yamlStateField } from "./state";
import { yamlKeymap } from "./keymap";
import { yamlCompletion } from "./completions";
import { yamlAffordances } from "./affordances";
import { yamlDecorations } from "./decorations";
import { findYamlRegions } from "../yaml/regions";
import { probeAt, renderBreadcrumb } from "../yaml/path";
import { yamlFoldRange } from "../yaml/fold";
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
    yamlAffordances(plugin),
    yamlDecorations(),

    // ── Keybindings ────────────────────────────────────────────────────
    yamlKeymap(plugin.app),

    // ── Folding (indentation-aware, scoped to YAML regions) ────────────
    foldService.of((state, lineStart) => {
      const doc = state.doc.toString();
      const region = findYamlRegions(doc).find(
        (r) => lineStart >= r.from && lineStart < r.to,
      );
      if (!region) return null;
      const range = yamlFoldRange(region.text, lineStart - region.from);
      if (!range) return null;
      return { from: region.from + range.from, to: region.from + range.to };
    }),

    // ── Status-bar breadcrumb of the cursor's YAML path ────────────────
    EditorView.updateListener.of((update) => {
      if (!update.selectionSet && !update.docChanged) return;
      const el = plugin.statusBarEl;
      if (!el) return;
      if (!plugin.settings.showBreadcrumbs) {
        el.textContent = "";
        return;
      }
      const doc = update.state.doc.toString();
      const pos = update.state.selection.main.head;
      let text = "";
      for (const region of findYamlRegions(doc)) {
        if (pos >= region.from && pos <= region.to) {
          text = renderBreadcrumb(region.kind, probeAt(region.text, pos - region.from).path);
          break;
        }
      }
      el.textContent = text;
    }),

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
