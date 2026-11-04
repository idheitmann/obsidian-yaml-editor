import { describe, it, expect } from "vitest";
import { hasViewBlock, htmlPathFor, initialMode } from "../src/render/viewmode";
import { renderYaml } from "../src/render/render";

describe("hasViewBlock", () => {
  it("finds a top-level _view key anywhere in the file", () => {
    expect(hasViewBlock("# note\n_view:\n  title: x\na: 1")).toBe(true);
    expect(hasViewBlock("a: 1\n_view: {title: x}\n")).toBe(true);
  });

  it("ignores nested or quoted mentions", () => {
    expect(hasViewBlock("a:\n  _view: x\n")).toBe(false);
    expect(hasViewBlock("note: see _view: below\n")).toBe(false);
  });
});

describe("initialMode", () => {
  const report = "_view: {title: R}\na: 1\n";

  it("opens reports rendered when the setting is on", () => {
    expect(initialMode(report, true)).toBe("rendered");
    expect(initialMode(report, false)).toBe("source");
    expect(initialMode("a: 1\n", true)).toBe("source");
  });

  it("prefers a saved pane mode", () => {
    expect(initialMode(report, true, "source")).toBe("source");
    expect(initialMode("a: 1\n", true, "rendered")).toBe("rendered");
    expect(initialMode(report, true, "junk")).toBe("rendered");
  });
});

describe("htmlPathFor", () => {
  it("swaps the extension", () => {
    expect(htmlPathFor("a/b/Report map.yaml")).toBe("a/b/Report map.html");
    expect(htmlPathFor("x.yml")).toBe("x.html");
  });
});

describe("palettes", () => {
  const yaml = "_view: {title: R}\nm: {a: 1, path: folder/File.md}\nlong: `code` here\n";

  it("theme palette uses Obsidian variables and no fixed colours or fonts", () => {
    const { html } = renderYaml(yaml, { palette: "theme" });
    expect(html).toContain("var(--background-modifier-border)");
    expect(html).not.toMatch(/#[0-9a-f]{6}/i);
    expect(html).not.toContain("Arial");
    expect(html).toContain('data-yr-path="folder/File.md"');
  });

  it("inline palette keeps fixed colours and plain-text paths", () => {
    const { html } = renderYaml(yaml);
    expect(html).toContain("#bfbfbf");
    expect(html).not.toContain("var(--");
    expect(html).not.toContain("data-yr-path");
  });
});
