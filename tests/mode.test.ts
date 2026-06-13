import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { wholeDocYaml, yamlRegions } from "../src/editor/mode";

describe("yamlRegions", () => {
  it("treats the whole document as one region when the facet is set", () => {
    const doc = "version: 1\nname: hi\n";
    const state = EditorState.create({ doc, extensions: [wholeDocYaml.of(true)] });
    const regions = yamlRegions(state);
    expect(regions).toHaveLength(1);
    expect(regions[0]!.from).toBe(0);
    expect(regions[0]!.to).toBe(doc.length);
    expect(regions[0]!.text).toBe(doc);
  });

  it("falls back to scanning frontmatter/fences when the facet is unset", () => {
    const doc = "---\nversion: 1\n---\n\nbody\n";
    const state = EditorState.create({ doc });
    const regions = yamlRegions(state);
    expect(regions).toHaveLength(1);
    expect(regions[0]!.kind).toBe("frontmatter");
    expect(regions[0]!.text).toBe("version: 1\n");
  });

  it("finds no regions in a plain note without the facet", () => {
    const state = EditorState.create({ doc: "just prose, no yaml\n" });
    expect(yamlRegions(state)).toHaveLength(0);
  });
});
