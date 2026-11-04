import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { codeFolding, foldEffect } from "@codemirror/language";
import { foldCount, foldEffectsFor, foldedEntries } from "../src/editor/foldstate";
import { yamlFoldRange } from "../src/yaml/fold";

const make = (doc: string) => EditorState.create({ doc, extensions: [codeFolding()] });

/** Fold the line containing `needle`, as the gutter would. */
const fold = (state: EditorState, needle: string) => {
  const text = state.doc.toString();
  const line = state.doc.line(text.split("\n").findIndex((l) => l.includes(needle)) + 1);
  const range = yamlFoldRange(text, line.from)!;
  return state.update({ effects: foldEffect.of(range) }).state;
};

/** Text of the lines that carry a fold. */
const foldedLines = (state: EditorState) =>
  foldedEntries(state).length ? collect(state) : [];
const collect = (state: EditorState) => {
  const out: string[] = [];
  const text = state.doc.toString().split("\n");
  for (const e of foldEffectsFor(state, foldedEntries(state))) {
    const { from } = e.value as { from: number };
    out.push(text[state.doc.lineAt(from).number - 1].trim());
  }
  return out;
};

describe("fold state bridge", () => {
  const doc = "tasks:\n  - name: one\n    sub:\n      x: 1\n  - name: two\n    sub:\n      x: 2\nother:\n  y: 1\n";

  it("reads folded nodes from the editor state", () => {
    let s = fold(make(doc), "- name: two");
    s = fold(s, "other:");
    expect(foldCount(s)).toBe(2);
    expect(foldedEntries(s).map((e) => e.path)).toEqual(["tasks[1]", "other"]);
    expect(foldedLines(s)).toEqual(["- name: two", "other:"]);
  });

  it("re-applies saved folds to a fresh state of changed text", () => {
    const saved = foldedEntries(fold(make(doc), "- name: two"));
    const changed = make("tasks:\n  - name: zero\n    sub:\n      x: 0\n" + doc.slice("tasks:\n".length));
    const restored = changed.update({ effects: foldEffectsFor(changed, saved) }).state;
    expect(foldCount(restored)).toBe(1);
    const at = restored.doc.lineAt(foldedEntries(restored).length ? findFoldFrom(restored) : 0);
    expect(at.text.trim()).toBe("- name: two");
  });

  it("returns no effects for nothing saved", () => {
    expect(foldEffectsFor(make(doc), [])).toEqual([]);
    expect(foldedEntries(make(doc))).toEqual([]);
  });
});

function findFoldFrom(state: EditorState): number {
  for (const e of foldEffectsFor(state, foldedEntries(state))) return (e.value as { from: number }).from;
  return 0;
}
