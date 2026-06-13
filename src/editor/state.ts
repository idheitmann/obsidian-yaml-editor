import {
  EditorState,
  StateField,
  StateEffect,
} from "@codemirror/state";
import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { findYamlRegions } from "../yaml/regions";
import { parseRegion } from "../yaml/parser";
import { probeAt } from "../yaml/path";
import type { YamlRegion, PathProbe } from "../types";

/**
 * The state stored per-editor by this plugin.
 */
export interface YamlEditorState {
  /** YAML regions in the document, sorted by `from`. */
  regions: YamlRegion[];
  /** Path probe keyed by cursor offset. Map is cleared and rebuilt on each doc change. */
  probes: Map<number, PathProbe>;
  /** Parse errors per region index. Only present for regions with errors. */
  parseErrors: Map<number, { from: number; to: number; message: string }[]>;
}

// ── Effects & fields ─────────────────────────────────────────────────────────

export const setYamlState = StateEffect.define<YamlEditorState>();

export const yamlStateField = StateField.define<YamlEditorState>({
  create() {
    return emptyState();
  },

  update(state, tr) {
    // Always recompute on doc change — incremental updates are too fragile
    // given that YAML regions can shift when the user types near fences.
    if (tr.docChanged) {
      return computeState(tr.newDoc.toString());
    }
    // Still update probes for selection-only changes.
    if (tr.selection) {
      const probes = new Map<number, PathProbe>();
      const doc = tr.newDoc.toString();
      for (const range of tr.state.selection.ranges) {
        const probe = resolveProbe(doc, range.head);
        if (probe) probes.set(range.head, probe);
      }
      return { ...state, probes };
    }
    return state;
  },


});

/** Empty / default state. */
function emptyState(): YamlEditorState {
  return { regions: [], probes: new Map(), parseErrors: new Map() };
}

/**
 * Full recompute: find all regions, parse each one, build error map.
 */
function computeState(doc: string): YamlEditorState {
  const regions = findYamlRegions(doc);
  const parseErrors = new Map<number, { from: number; to: number; message: string }[]>();
  for (let i = 0; i < regions.length; i++) {
    const { errors } = parseRegion(regions[i]!.text);
    if (errors.length > 0) parseErrors.set(i, errors);
  }
  return { regions, probes: new Map(), parseErrors };
}

/**
 * Lightweight probe recompute: just find the region containing `pos`
 * and run probeAt on it. Used when the doc hasn't changed but the cursor moved.
 */
function resolveProbe(doc: string, pos: number): PathProbe | null {
  const regions = findYamlRegions(doc);
  for (const region of regions) {
    if (pos >= region.from && pos <= region.to) {
      return probeAt(region.text, pos - region.from);
    }
  }
  return null;
}

/** Convenience accessor — get the YAML state out of any EditorState. */
export function yamlEditorState(state: EditorState): YamlEditorState | null {
  return state.field(yamlStateField, false) ?? null;
}

// ── ViewPlugin for per-view concerns ────────────────────────────────────────

/**
 * A ViewPlugin that keeps the state's `probes` Map current as the cursor moves.
 * This is purely a cursor-tracking shim; the heavy lifting is in the StateField.
 */
export const yamlViewPlugin = ViewPlugin.fromClass(
  class {
    constructor(readonly view: EditorView) {}

    update(update: ViewUpdate) {
      if (!update.docChanged && !update.selectionSet) return;

      const doc = update.state.doc.toString();
      const extState = yamlEditorState(update.state);
      if (!extState) return;

      const probes = new Map<number, PathProbe>();
      for (const range of update.state.selection.ranges) {
        const probe = resolveProbe(doc, range.head);
        if (probe) probes.set(range.head, probe);
      }

      // Push the updated probes back into the StateField via an effect.
      update.view.dispatch({
        effects: setYamlState.of({ ...extState, probes }),
      });
    }
  },
);
