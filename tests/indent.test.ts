import { describe, it, expect } from "vitest";
import { computeEnter } from "../src/editor/indent";

describe("computeEnter", () => {
  it("keeps the same indent after a key: value pair", () => {
    expect(computeEnter("title: Hi")).toEqual({ newIndent: 0, prefix: "" });
    expect(computeEnter("  name: Foo")).toEqual({ newIndent: 2, prefix: "" });
  });

  it("indents one level after a block-opening key", () => {
    expect(computeEnter("project:")).toEqual({ newIndent: 2, prefix: "" });
    expect(computeEnter("  meta:")).toEqual({ newIndent: 4, prefix: "" });
  });

  it("continues a sequence with a dash at the same indent", () => {
    expect(computeEnter("  - apple")).toEqual({ newIndent: 2, prefix: "- " });
    expect(computeEnter("- apple")).toEqual({ newIndent: 0, prefix: "- " });
  });

  it("continues an empty sequence item", () => {
    expect(computeEnter("  -")).toEqual({ newIndent: 2, prefix: "- " });
  });

  it("does not treat a comment as a block opener", () => {
    expect(computeEnter("# a comment:")).toEqual({ newIndent: 0, prefix: "" });
  });

  it("keeps indent on a blank line", () => {
    expect(computeEnter("    ")).toEqual({ newIndent: 4, prefix: "" });
  });
});
