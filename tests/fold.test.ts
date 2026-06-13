import { describe, it, expect } from "vitest";
import { yamlFoldRange } from "../src/yaml/fold";

/** Resolve a fold range for the line beginning at the `|` marker. */
function foldAt(textWithMarker: string) {
  const lineStart = textWithMarker.indexOf("|");
  const text = textWithMarker.replace("|", "");
  return { range: yamlFoldRange(text, lineStart), text };
}

describe("yamlFoldRange", () => {
  it("folds a mapping key over its more-indented children", () => {
    const { range, text } = foldAt("|project:\n  a: 1\n  b: 2\n");
    expect(range).not.toBeNull();
    // Folds from end of "project:" to end of "  b: 2".
    expect(text.slice(range!.to - 6, range!.to)).toBe("  b: 2");
  });

  it("returns null for a leaf line with no children", () => {
    expect(yamlFoldRange("a: 1\nb: 2\n", 0)).toBeNull();
  });

  it("does not absorb trailing blank lines into the fold", () => {
    const { range, text } = foldAt("|a:\n  x: 1\n\nb: 2\n");
    expect(range).not.toBeNull();
    expect(text.slice(range!.to - 6, range!.to)).toBe("  x: 1");
  });

  it("folds a sequence under its key", () => {
    const { range, text } = foldAt("|tags:\n  - a\n  - b\n");
    expect(range).not.toBeNull();
    expect(text.slice(range!.to - 3, range!.to)).toBe("- b");
  });

  it("returns null on a comment line", () => {
    expect(yamlFoldRange("# header\n  not a child\n", 0)).toBeNull();
  });
});
