import { describe, it, expect } from "vitest";
import { FoldIdentities, foldEntriesFor, matchFoldEntries, shapeOf } from "../src/yaml/foldid";

/** Index of the line containing `needle` (first occurrence). */
const lineOf = (text: string, needle: string) => {
  const i = text.split("\n").findIndex((l) => l.includes(needle));
  if (i < 0) throw new Error(`"${needle}" not in text`);
  return i;
};

/** Save folds on the lines containing `needles` in `before`, restore into `after`, and return the restored lines' text. */
const roundTrip = (before: string, needles: string[], after: string) => {
  const entries = foldEntriesFor(before, needles.map((n) => lineOf(before, n)));
  return matchFoldEntries(after, entries).map((i) => after.split("\n")[i].trim());
};

describe("fold identity", () => {
  const text = [
    "a:",
    "  b:",
    "    c: 1",
    "tasks:",
    "  - name: one",
    "    sub:",
    "      x: 1",
    "  - name: two",
    "    sub:",
    "      x: 2",
    "groups:",
    "  -",
    "    - 1",
    "",
  ].join("\n");
  const ids = new FoldIdentities(text);
  const path = (needle: string, nth = 0) => {
    const lines = text.split("\n");
    const i = lines.map((l, k) => (l.includes(needle) ? k : -1)).filter((k) => k >= 0)[nth];
    return ids.entryAt(i)?.path;
  };

  it("builds the full path from the document root", () => {
    expect(path("a:")).toBe("a");
    expect(path("b:")).toBe("a.b");
    expect(path("tasks:")).toBe("tasks");
  });

  it("gives list items their index and nested keys their item", () => {
    expect(path("- name: one")).toBe("tasks[0]");
    expect(path("sub:", 0)).toBe("tasks[0].sub");
    expect(path("sub:", 1)).toBe("tasks[1].sub");
    expect(ids.entryAt(text.split("\n").indexOf("  -"))?.path).toBe("groups[0]");
  });

  it("fingerprints keys by name and items by their identifying text", () => {
    const one = ids.entryAt(lineOf(text, "- name: one"))!;
    const two = ids.entryAt(lineOf(text, "- name: two"))!;
    expect(ids.entryAt(lineOf(text, "b:"))!.fp).toBe("k:b");
    expect(one.fp).toMatch(/^i:[0-9a-f]{8}$/);
    expect(one.fp).not.toBe(two.fp);
    // a bare dash is identified by its first content line
    const bare = ids.entryAt(text.split("\n").indexOf("  -"))!;
    expect(bare.fp).toMatch(/^i:/);
    expect(bare.fp).not.toBe(one.fp);
  });

  it("separates documents in a multi-document file", () => {
    const multi = "a:\n  b: 1\n---\na:\n  b: 2\n";
    const m = new FoldIdentities(multi);
    expect(m.entryAt(0)!.path).toBe("a");
    expect(m.entryAt(3)!.path).toBe("#1/a");
  });

  it("only treats lines with a more-indented block as foldable", () => {
    expect(ids.foldable(lineOf(text, "a:"))).toBe(true);
    expect(ids.foldable(lineOf(text, "c: 1"))).toBe(false);
  });

  it("blanks list indices for the shape", () => {
    expect(shapeOf("tasks[3].sub[0].x")).toBe("tasks[].sub[].x");
  });
});

describe("restoring folds", () => {
  const before = "tasks:\n  - name: one\n    sub:\n      x: 1\n  - name: two\n    sub:\n      x: 2\nother:\n  y: 1\n";

  it("restores folds in unchanged text, including same-named keys under different items", () => {
    expect(roundTrip(before, ["- name: two", "other:"], before)).toEqual(["- name: two", "other:"]);
    const lines = before.split("\n");
    const secondSub = lines.findIndex((l, i) => l.includes("sub:") && i > 3);
    const restored = matchFoldEntries(before, foldEntriesFor(before, [secondSub]));
    expect(restored).toEqual([secondSub]);
  });

  it("follows a list item after an item is inserted above it", () => {
    const after = "tasks:\n  - name: zero\n    sub:\n      x: 0\n" + before.slice("tasks:\n".length);
    expect(roundTrip(before, ["- name: two"], after)).toEqual(["- name: two"]);
  });

  it("follows a list item after the list is reordered", () => {
    const after = "tasks:\n  - name: two\n    sub:\n      x: 2\n  - name: one\n    sub:\n      x: 1\nother:\n  y: 1\n";
    expect(roundTrip(before, ["- name: one"], after)).toEqual(["- name: one"]);
  });

  it("survives lines added above and a value changing inside the fold", () => {
    const after = "# header\nnew: 1\n" + before.replace("x: 2", "x: 20");
    expect(roundTrip(before, ["- name: two", "other:"], after)).toEqual(["- name: two", "other:"]);
  });

  it("drops a fold it can't place with confidence", () => {
    // the item was renamed and two others now look alike: nothing matches exactly or uniquely
    const after = "tasks:\n  - name: three\n    sub:\n      x: 1\n  - name: three\n    sub:\n      x: 2\nother:\n  y: 1\n";
    expect(roundTrip(before, ["- name: one"], after)).toEqual([]);
    // the key is gone
    expect(roundTrip(before, ["other:"], "tasks:\n  - name: one\n    sub:\n      x: 1\n")).toEqual([]);
  });

  it("doesn't fold a node that no longer has children", () => {
    expect(roundTrip(before, ["other:"], before.replace("other:\n  y: 1\n", "other: 1\n"))).toEqual([]);
  });

  it("uses each line once", () => {
    const entries = foldEntriesFor(before, [lineOf(before, "other:")]);
    expect(matchFoldEntries(before, [...entries, ...entries])).toEqual([lineOf(before, "other:")]);
  });
});
