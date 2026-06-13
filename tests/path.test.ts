import { describe, it, expect } from "vitest";
import { probeAt, locateKeyPath } from "../src/yaml/path";

/** Helper: build region text and resolve the probe at the `|` marker. */
function probeAtMarker(textWithCursor: string) {
  const offset = textWithCursor.indexOf("|");
  if (offset === -1) throw new Error("test text must contain a | cursor marker");
  const text = textWithCursor.replace("|", "");
  return probeAt(text, offset);
}

describe("probeAt", () => {
  it("reports an empty path at the top level", () => {
    const p = probeAtMarker("|\n");
    expect(p.path).toEqual([]);
  });

  it("distinguishes key position from value position on a top-level pair", () => {
    expect(probeAtMarker("ti|tle: Hi\n").position).toBe("key");
    expect(probeAtMarker("title: H|i\n").position).toBe("value");
  });

  it("resolves the parent path inside a nested map value", () => {
    const p = probeAtMarker("a:\n  b: 1|\n");
    expect(p.path).toEqual(["a"]);
    expect(p.position).toBe("value");
  });

  it("resolves a two-level parent path", () => {
    const p = probeAtMarker("project:\n  meta:\n    name: F|oo\n");
    expect(p.path).toEqual(["project", "meta"]);
  });

  it("detects sequence context", () => {
    const p = probeAtMarker("tags:\n  - a\n  - |\n");
    expect(p.inSequence).toBe(true);
    expect(p.path[0]).toBe("tags");
  });

  it("tracks indentation at the cursor", () => {
    const p = probeAtMarker("a:\n  b: |\n");
    expect(p.indent).toBe(2);
  });

  it("handles quoted keys", () => {
    const p = probeAtMarker('"quoted key":\n  child: |\n');
    expect(p.path).toEqual(["quoted key"]);
  });

  it("skips blank lines and comments when walking", () => {
    const p = probeAtMarker("a:\n  # a comment\n\n  b: |\n");
    expect(p.path).toEqual(["a"]);
  });
});

describe("locateKeyPath", () => {
  it("finds a top-level key", () => {
    const text = "title: Hi\ntags: [a]\n";
    const at = locateKeyPath(text, ["tags"]);
    expect(at).not.toBeNull();
    expect(text.slice(at! - 1, at!)).toBe(":");
  });

  it("respects nesting — a.b matches only b under a", () => {
    const text = "other:\n  b: wrong\na:\n  b: right\n";
    const at = locateKeyPath(text, ["a", "b"])!;
    // The match should be on the second `b:` (value "right").
    expect(text.slice(at).trimStart().startsWith("right")).toBe(true);
  });

  it("does not match a nested key by its leaf name alone", () => {
    const text = "a:\n  b: 1\n";
    expect(locateKeyPath(text, ["b"])).toBeNull();
  });

  it("returns null for an absent path", () => {
    expect(locateKeyPath("a: 1\n", ["nope"])).toBeNull();
  });

  it("returns null for an empty segment list", () => {
    expect(locateKeyPath("a: 1\n", [])).toBeNull();
  });
});
