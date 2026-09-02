import { describe, it, expect } from "vitest";
import { hangWidth } from "../src/yaml/hang";

describe("hangWidth", () => {
  it("is zero for an unindented mapping line", () => {
    expect(hangWidth("title: hello")).toBe(0);
  });

  it("matches the leading indent of a nested key", () => {
    expect(hangWidth("  description: a long value")).toBe(2);
    expect(hangWidth("      deep: value")).toBe(6);
  });

  it("clears the sequence marker so items align under their own text", () => {
    expect(hangWidth("- first item")).toBe(2);
    expect(hangWidth("  - nested item")).toBe(4);
  });

  it("stacks nested sequence markers", () => {
    expect(hangWidth("- - inner")).toBe(4);
  });

  it("does not consume a bare dash with no content after it", () => {
    expect(hangWidth("  -")).toBe(2);
  });

  it("indents comment lines by their own indent", () => {
    expect(hangWidth("  # a comment")).toBe(2);
  });

  it("is zero for blank and whitespace-only lines", () => {
    expect(hangWidth("")).toBe(0);
    expect(hangWidth("    ")).toBe(0);
  });

  it("bails out on tab indentation, which has no fixed character width", () => {
    expect(hangWidth("\tkey: value")).toBe(0);
    expect(hangWidth("  \tkey: value")).toBe(0);
  });

  it("bails out past the max width rather than crushing the wrapped text", () => {
    expect(hangWidth(" ".repeat(41) + "key: value")).toBe(0);
    expect(hangWidth(" ".repeat(8) + "key: value", 4)).toBe(0);
  });
});
