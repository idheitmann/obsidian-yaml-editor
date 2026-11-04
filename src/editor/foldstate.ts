// Bridge between CodeMirror's fold state and saved fold identities
// (src/yaml/foldid.ts). Works on an EditorState, so it's testable without a DOM.

import type { EditorState, StateEffect } from "@codemirror/state";
import { foldEffect, foldState } from "@codemirror/language";
import { yamlFoldRange } from "../yaml/fold";
import { foldEntriesFor, matchFoldEntries, type FoldEntry } from "../yaml/foldid";

/** Identities of the folded nodes in a whole-document YAML state. */
export function foldedEntries(state: EditorState): FoldEntry[] {
  const folds = state.field(foldState, false);
  if (!folds || folds.size === 0) return [];
  const lines: number[] = [];
  // A fold starts at the end of the line it collapses under.
  folds.between(0, state.doc.length, (from) => {
    lines.push(state.doc.lineAt(from).number - 1);
  });
  return foldEntriesFor(state.doc.toString(), lines);
}

/** Fold effects that re-apply `entries` to `state`; entries that can't be placed are dropped. */
export function foldEffectsFor(state: EditorState, entries: FoldEntry[]): StateEffect<unknown>[] {
  if (!entries.length) return [];
  const doc = state.doc;
  const text = doc.toString();
  return matchFoldEntries(text, entries)
    .map((i) => yamlFoldRange(text, doc.line(i + 1).from))
    .filter((r): r is { from: number; to: number } => r !== null)
    .map((r) => foldEffect.of(r));
}

/** Number of folded ranges in `state`. */
export function foldCount(state: EditorState): number {
  return state.field(foldState, false)?.size ?? 0;
}
