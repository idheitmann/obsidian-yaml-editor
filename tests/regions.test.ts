import { describe, it, expect } from "vitest";
import { findYamlRegions, regionAt } from "../src/yaml/regions";

describe("findYamlRegions", () => {
  it("finds frontmatter at the top of a doc", () => {
    const doc = "---\ntitle: Hi\ntags: [a, b]\n---\n\nbody text\n";
    const regions = findYamlRegions(doc);
    expect(regions).toHaveLength(1);
    expect(regions[0]!.kind).toBe("frontmatter");
    expect(regions[0]!.text).toBe("title: Hi\ntags: [a, b]\n");
  });

  it("ignores a --- that is not at offset 0", () => {
    const doc = "intro\n\n---\ntitle: Hi\n---\n";
    const regions = findYamlRegions(doc);
    expect(regions.filter((r) => r.kind === "frontmatter")).toHaveLength(0);
  });

  it("requires the opening --- line to be bare", () => {
    const doc = "--- not frontmatter\ntitle: Hi\n---\n";
    expect(findYamlRegions(doc)).toHaveLength(0);
  });

  it("accepts ... as a frontmatter terminator", () => {
    const doc = "---\ntitle: Hi\n...\nbody\n";
    const regions = findYamlRegions(doc);
    expect(regions).toHaveLength(1);
    expect(regions[0]!.text).toBe("title: Hi\n");
  });

  it("finds fenced yaml and yml code blocks", () => {
    const doc = "# Note\n\n```yaml\nkey: 1\n```\n\n```yml\nkey: 2\n```\n";
    const regions = findYamlRegions(doc);
    expect(regions).toHaveLength(2);
    expect(regions[0]!.kind).toBe("codeblock");
    expect(regions[0]!.text).toBe("key: 1");
    expect(regions[1]!.text).toBe("key: 2");
  });

  it("ignores non-yaml fenced blocks", () => {
    const doc = "```json\n{}\n```\n";
    expect(findYamlRegions(doc)).toHaveLength(0);
  });

  it("returns frontmatter and code blocks together, sorted by offset", () => {
    const doc = "---\na: 1\n---\n\ntext\n\n```yaml\nb: 2\n```\n";
    const regions = findYamlRegions(doc);
    expect(regions.map((r) => r.kind)).toEqual(["frontmatter", "codeblock"]);
    expect(regions[0]!.from).toBeLessThan(regions[1]!.from);
  });

  it("region text round-trips against host doc offsets", () => {
    const doc = "---\ntitle: Hi\n---\n";
    const r = findYamlRegions(doc)[0]!;
    expect(doc.slice(r.from, r.to)).toBe(r.text);
  });
});

describe("regionAt", () => {
  it("returns the region containing a position", () => {
    const doc = "---\ntitle: Hi\n---\n";
    const regions = findYamlRegions(doc);
    expect(regionAt(regions, 5)).toBe(regions[0]);
    expect(regionAt(regions, 0)).toBeNull();
  });
});
