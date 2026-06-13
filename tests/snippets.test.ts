import { describe, it, expect } from "vitest";
import {
  expandDatePlaceholders,
  toCodeMirrorSnippet,
  stripSnippetMarkers,
  BUILTIN_SNIPPETS,
} from "../src/yaml/snippets";

const FIXED = new Date("2020-01-02T03:04:05.000Z");

describe("expandDatePlaceholders", () => {
  it("substitutes ${TODAY} and ${NOW}", () => {
    expect(expandDatePlaceholders("d: ${TODAY}", FIXED)).toBe("d: 2020-01-02");
    expect(expandDatePlaceholders("d: ${NOW}", FIXED)).toBe("d: 2020-01-02T03:04:05.000Z");
  });

  it("leaves tab stops untouched", () => {
    expect(expandDatePlaceholders("k: ${1:v}", FIXED)).toBe("k: ${1:v}");
  });
});

describe("toCodeMirrorSnippet", () => {
  it("collapses choice syntax to the first option", () => {
    expect(toCodeMirrorSnippet("publish: ${1|true,false|}")).toBe("publish: ${1:true}");
  });

  it("drops the ${0} final-stop marker", () => {
    expect(toCodeMirrorSnippet("tags:\n  - ${1:tag}\n${0}")).toBe("tags:\n  - ${1:tag}\n");
  });

  it("preserves ordinary numbered fields", () => {
    expect(toCodeMirrorSnippet("${1:key}: ${2:value}")).toBe("${1:key}: ${2:value}");
  });

  it("never leaves a literal ${0} or choice bar in any builtin snippet", () => {
    for (const snip of BUILTIN_SNIPPETS) {
      const out = toCodeMirrorSnippet(expandDatePlaceholders(snip.body, FIXED));
      expect(out, snip.id).not.toMatch(/\$\{0/);
      expect(out, snip.id).not.toMatch(/\|/);
    }
  });
});

describe("stripSnippetMarkers", () => {
  it("reduces choices to the first option", () => {
    expect(stripSnippetMarkers("${1|todo,done|}")).toBe("todo");
  });

  it("keeps the default text of a labelled field", () => {
    expect(stripSnippetMarkers("- ${1:item}")).toBe("- item");
  });

  it("removes bare numbered fields", () => {
    expect(stripSnippetMarkers("k: ${1}${0}")).toBe("k: ");
  });

  it("leaves no ${...} markers in any builtin snippet", () => {
    for (const snip of BUILTIN_SNIPPETS) {
      const out = stripSnippetMarkers(expandDatePlaceholders(snip.body, FIXED));
      expect(out, snip.id).not.toMatch(/\$\{/);
    }
  });
});
