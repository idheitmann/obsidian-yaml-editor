import { describe, it, expect } from "vitest";
import {
  applyEdits,
  classifyLines,
  headerNodeAt,
  nodeAt,
  siblingsOf,
  moveNode,
  indentSubtree,
  sortKeys,
  scalarToList,
  listToMap,
  mapToListOfMaps,
  insertKeyPoint,
  dataOf,
  type StructuralResult,
} from "../src/yaml/structure";

/** Offset of the first occurrence of `needle` in `text`. */
const at = (text: string, needle: string) => {
  const i = text.indexOf(needle);
  if (i < 0) throw new Error(`"${needle}" not in text`);
  return i;
};

/** Apply a successful result, or fail the test with its error. */
const run = (text: string, r: StructuralResult | null): string => {
  if (!r) throw new Error("no result");
  if ("error" in r) throw new Error(r.error);
  return applyEdits(text, r.edits);
};

const errorOf = (r: StructuralResult | null) => (r && "error" in r ? r.error : null);

describe("applyEdits", () => {
  it("applies edits in any order and copies the rest unchanged", () => {
    expect(
      applyEdits("abcdef", [
        { from: 4, to: 5, insert: "E" },
        { from: 0, to: 1, insert: "A" },
        { from: 2, to: 2, insert: "+" },
      ]),
    ).toBe("Ab+cdEf");
  });

  it("rejects overlapping edits", () => {
    expect(() =>
      applyEdits("abcdef", [
        { from: 0, to: 3, insert: "" },
        { from: 2, to: 4, insert: "" },
      ]),
    ).toThrow();
  });
});

describe("node model", () => {
  const text = [
    "# about a",
    "a:",
    "  x: 1",
    "",
    "  y: |",
    "    z: not a key",
    "b:",
    "- one",
    "- two",
    "c: 3",
  ].join("\n");
  const lines = classifyLines(text);

  it("treats block-scalar content as text, not keys", () => {
    expect(lines[5].kind).toBe("text");
  });

  it("spans a key's subtree and attaches the comment above it", () => {
    const a = headerNodeAt(lines, 1, "key")!;
    expect(a.leadStart).toBe(0);
    expect(a.end).toBe(6);
  });

  it("lets a key own a compact sequence at its own indent", () => {
    const b = headerNodeAt(lines, 6, "key")!;
    expect(b.end).toBe(9);
  });

  it("finds siblings at the same level", () => {
    const x = headerNodeAt(lines, 2, "key")!;
    expect(siblingsOf(lines, x).map((n) => n.key)).toEqual(["x", "y"]);
    const top = headerNodeAt(lines, 9, "key")!;
    expect(siblingsOf(lines, top).map((n) => n.key)).toEqual(["a", "b", "c"]);
    const one = headerNodeAt(lines, 7, "item")!;
    expect(siblingsOf(lines, one).map((n) => n.line)).toEqual([7, 8]);
  });

  it("resolves a line inside a node to that node", () => {
    expect(nodeAt(lines, 5, "key")!.key).toBe("y");
  });

  it("stops at document markers", () => {
    const multi = classifyLines("a: 1\nb: 2\n---\nc: 3");
    const b = headerNodeAt(multi, 1, "key")!;
    expect(siblingsOf(multi, b).map((n) => n.key)).toEqual(["a", "b"]);
  });
});

describe("moveNode", () => {
  it("swaps a key with its sibling, carrying subtree and comments", () => {
    const text = "a: 1\n# about b\nb:\n  c: 2 # keep\n\nd: 4\n";
    const out = run(text, moveNode(text, at(text, "b:"), "up"));
    expect(out).toBe("# about b\nb:\n  c: 2 # keep\na: 1\n\nd: 4\n");
  });

  it("keeps the blank-line gap between siblings in place", () => {
    const text = "a: 1\n\nb: 2\n";
    expect(run(text, moveNode(text, 0, "down"))).toBe("b: 2\n\na: 1\n");
  });

  it("moves list items with their subtrees", () => {
    const text = "list:\n  - name: a\n    n: 1\n  - name: b\n    n: 2\n";
    const out = run(text, moveNode(text, at(text, "- name: b"), "up"));
    expect(out).toBe("list:\n  - name: b\n    n: 2\n  - name: a\n    n: 1\n");
  });

  it("moves a key onto a list item's line", () => {
    const text = "- a: 1\n  b: 2\n";
    expect(run(text, moveNode(text, at(text, "b:"), "up"))).toBe("- b: 2\n  a: 1\n");
  });

  it("puts the cursor on the moved node", () => {
    const text = "a: 1\nb: 2\n";
    const r = moveNode(text, 0, "down");
    expect("cursor" in r && r.cursor).toBe(5);
  });

  it("refuses at the ends and on non-node lines", () => {
    const text = "a: 1\nb: 2\n";
    expect(errorOf(moveNode(text, 0, "up"))).toMatch(/first/);
    expect(errorOf(moveNode(text, at(text, "b"), "down"))).toMatch(/last/);
    expect(errorOf(moveNode("a: [1,\n", 0, "down"))).toMatch(/errors/);
    expect(moveNode("a: |\n  text\nb: 1\n", 6, "down")).toBeNull();
  });
});

describe("indentSubtree", () => {
  it("indents the key, its children and its comments", () => {
    const text = "a:\n# c\nb:\n  x: 1\n\n  y: 2\nz: 3\n";
    const out = run(text, indentSubtree(text, at(text, "b:"), "in"));
    expect(out).toBe("a:\n  # c\n  b:\n    x: 1\n\n    y: 2\nz: 3\n");
  });

  it("outdents a subtree, and refuses past the left margin", () => {
    const text = "a:\n  b:\n    c: 1\n";
    expect(run(text, indentSubtree(text, at(text, "b:"), "out"))).toBe("a:\nb:\n  c: 1\n");
    expect(errorOf(indentSubtree(text, 0, "out"))).toMatch(/outermost/);
  });

  it("outdents with later siblings by moving the node after its parent, leaving the siblings in place", () => {
    const text = "a:\n  x:\n    k: 1\n  y: 2\n  z: 3\nb: 4\n";
    const r = indentSubtree(text, at(text, "x:"), "out");
    const out = run(text, r);
    expect(out).toBe("a:\n  y: 2\n  z: 3\nx:\n  k: 1\nb: 4\n");
    expect(out.slice((r as { cursor: number }).cursor).startsWith("x:")).toBe(true);
  });

  it("a later Tab nests the node under the parent again without capturing the siblings", () => {
    const text = "a:\n  x:\n    k: 1\n  y: 2\nb: 4\n";
    const out = run(text, indentSubtree(text, at(text, "x:"), "out"));
    expect(run(out, indentSubtree(out, at(out, "x:"), "in"))).toBe("a:\n  y: 2\n  x:\n    k: 1\nb: 4\n");
  });

  it("carries attached comments, and works at the end of a file without a newline", () => {
    const text = "a:\n  # about x\n  x: 1\n  y: 2";
    expect(run(text, indentSubtree(text, at(text, "x:"), "out"))).toBe("a:\n  y: 2\n# about x\nx: 1");
  });

  it("moves list items the same way", () => {
    const text = "-\n  - 1\n  - 2\n- 3\n";
    expect(run(text, indentSubtree(text, at(text, "- 1"), "out"))).toBe("-\n  - 2\n- 1\n- 3\n");
  });

  it("refuses a logical outdent that wouldn't parse", () => {
    const keyIntoList = "- name: a\n  role: b\n  x: c\n";
    expect(errorOf(indentSubtree(keyIntoList, at(keyIntoList, "role"), "out"))).toMatch(/valid YAML/);
    const itemIntoMap = "a:\n  - b:\n      - 1\n      - 2\n    c: 3\n";
    expect(errorOf(indentSubtree(itemIntoMap, at(itemIntoMap, "- 1"), "out"))).toMatch(/valid YAML/);
    const duplicate = "x: 0\na:\n  x: 1\n  y: 2\n";
    expect(errorOf(indentSubtree(duplicate, at(duplicate, "  x:") + 2, "out"))).toMatch(/valid YAML/);
  });

  it("returns null off a key or item line, so Tab falls back", () => {
    expect(indentSubtree("a: |\n  text\n", 6, "in")).toBeNull();
    expect(indentSubtree("\n", 0, "in")).toBeNull();
  });
});

describe("sortKeys", () => {
  it("sorts case-insensitively, keeping comments with their keys", () => {
    const text = "# yaml-schema: note\nzeta: 1\n# about Alpha\nAlpha:\n  nested: true\nbeta: 2\n";
    const out = run(text, sortKeys(text, at(text, "beta")));
    expect(out).toBe("# yaml-schema: note\n# about Alpha\nAlpha:\n  nested: true\nbeta: 2\nzeta: 1\n");
  });

  it("sorts only the mapping the cursor is in", () => {
    const text = "b:\n  z: 1\n  y: 2\na: 3\n";
    expect(run(text, sortKeys(text, at(text, "z")))).toBe("b:\n  y: 2\n  z: 1\na: 3\n");
  });

  it("sorts keys of a map inside a list item", () => {
    const text = "- c: 1\n  a: 2\n";
    expect(run(text, sortKeys(text, at(text, "a:")))).toBe("- a: 2\n  c: 1\n");
  });

  it("says when already sorted", () => {
    expect(errorOf(sortKeys("a: 1\nb: 2\n", 0))).toMatch(/already/);
  });
});

describe("shape conversions", () => {
  it("scalar → list keeps the inline comment on the key line", () => {
    const text = "x: 1\ntags: foo # c\ny: 2\n";
    expect(run(text, scalarToList(text, at(text, "tags")))).toBe("x: 1\ntags: # c\n  - foo\ny: 2\n");
  });

  it("scalar → list refuses non-scalars", () => {
    expect(errorOf(scalarToList("a: [1]\n", 0))).toMatch(/plain/);
    expect(errorOf(scalarToList("a:\n  b: 1\n", 0))).toMatch(/no value/);
  });

  it("list of plain values → map of keys", () => {
    const text = "a:\n  - one\n  # note\n  - two # c\nb: 1\n";
    expect(run(text, listToMap(text, 0))).toBe("a:\n  one:\n  # note\n  two: # c\nb: 1\n");
  });

  it("compact list → map moves in one level", () => {
    const text = "a:\n- one\n- two\n";
    expect(run(text, listToMap(text, 0))).toBe("a:\n  one:\n  two:\n");
  });

  it("list holding one map → that map", () => {
    const text = "author:\n  - name: x\n    email: y\n";
    expect(run(text, listToMap(text, 0))).toBe("author:\n  name: x\n  email: y\n");
  });

  it("list → map refuses duplicates and mixed items", () => {
    expect(errorOf(listToMap("a:\n  - x\n  - x\n", 0))).toMatch(/repeated/);
    expect(errorOf(listToMap("a:\n  - x\n  - k: v\n", 0))).toMatch(/plain values/);
  });

  it("map → list of maps", () => {
    const text = "author:\n  name: x\n  # about email\n  email: y\nnext: 1\n";
    expect(run(text, mapToListOfMaps(text, 0))).toBe(
      "author:\n  - name: x\n    # about email\n    email: y\nnext: 1\n",
    );
  });

  it("round-trips: map → list of maps → map", () => {
    const text = "author:\n  name: x\n  email: y\n";
    const list = run(text, mapToListOfMaps(text, 0));
    expect(run(list, listToMap(list, 0))).toBe(text);
  });
});

describe("insertKeyPoint", () => {
  it("opens a sibling line after the node's subtree", () => {
    const text = "a:\n  x: 1\nb: 2\n";
    const out = run(text, insertKeyPoint(text, 0, "sibling"));
    expect(out).toBe("a:\n  x: 1\n\nb: 2\n");
  });

  it("opens a child line at the existing children's indent", () => {
    const text = "a:\n    x: 1\nb: 2\n";
    expect(run(text, insertKeyPoint(text, 0, "child"))).toBe("a:\n    x: 1\n    \nb: 2\n");
  });

  it("continues a list when the children are items", () => {
    const text = "a:\n  - 1\n";
    expect(run(text, insertKeyPoint(text, 0, "child"))).toBe("a:\n  - 1\n  - \n");
  });
});

describe("dataOf", () => {
  it("ignores key order but not values", () => {
    expect(dataOf("a: 1\nb: 2")).toBe(dataOf("b: 2\na: 1"));
    expect(dataOf("a: 1")).not.toBe(dataOf("a: 2"));
    expect(dataOf("a: [")).toBeNull();
  });
});
