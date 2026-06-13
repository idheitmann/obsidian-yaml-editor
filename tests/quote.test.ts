import { describe, it, expect } from "vitest";
import {
  needsQuoting,
  isQuoted,
  quoteScalar,
  unquoteScalar,
  toggleQuote,
  findValueSpan,
} from "../src/yaml/quote";

describe("needsQuoting", () => {
  it("does not quote ordinary scalars", () => {
    expect(needsQuoting("hello")).toBe(false);
    expect(needsQuoting("hello world")).toBe(false);
    expect(needsQuoting("42")).toBe(false);
  });

  it("does not quote URLs (colon not followed by space)", () => {
    expect(needsQuoting("http://example.com")).toBe(false);
    expect(needsQuoting("a#b")).toBe(false); // hash not preceded by space
  });

  it("quotes values that would parse as a mapping or comment", () => {
    expect(needsQuoting("key: value")).toBe(true);
    expect(needsQuoting("trailing:")).toBe(true);
    expect(needsQuoting("value # not a comment")).toBe(true);
  });

  it("quotes reserved scalars regardless of case", () => {
    expect(needsQuoting("true")).toBe(true);
    expect(needsQuoting("NO")).toBe(true);
    expect(needsQuoting("Null")).toBe(true);
    expect(needsQuoting("~")).toBe(true);
  });

  it("quotes leading indicators and surrounding whitespace", () => {
    expect(needsQuoting("[notalist")).toBe(true);
    expect(needsQuoting("@handle")).toBe(true);
    expect(needsQuoting("- item")).toBe(true);
    expect(needsQuoting(" leading")).toBe(true);
    expect(needsQuoting("trailing ")).toBe(true);
  });
});

describe("quoteScalar / unquoteScalar", () => {
  it("uses single quotes by default", () => {
    expect(quoteScalar("key: value")).toBe("'key: value'");
  });

  it("uses double quotes and escapes when the value has a single quote", () => {
    expect(quoteScalar("it's")).toBe('"it\'s"');
  });

  it("round-trips single-quoted values", () => {
    expect(unquoteScalar(quoteScalar("a: b"))).toBe("a: b");
  });

  it("round-trips double-quoted values with apostrophes", () => {
    expect(unquoteScalar(quoteScalar("it's"))).toBe("it's");
  });

  it("unquotes doubled single quotes", () => {
    expect(unquoteScalar("'it''s'")).toBe("it's");
  });

  it("leaves unquoted input unchanged", () => {
    expect(unquoteScalar("plain")).toBe("plain");
  });
});

describe("isQuoted / toggleQuote", () => {
  it("detects quoted values", () => {
    expect(isQuoted("'x'")).toBe(true);
    expect(isQuoted('"x"')).toBe(true);
    expect(isQuoted("x")).toBe(false);
    expect(isQuoted("'mismatched\"")).toBe(false);
  });

  it("toggles both directions", () => {
    expect(toggleQuote("hello")).toBe("'hello'");
    expect(toggleQuote("'hello'")).toBe("hello");
  });
});

describe("findValueSpan", () => {
  it("finds a mapping value", () => {
    const span = findValueSpan("title: Hello")!;
    expect(span.value).toBe("Hello");
    expect("title: Hello".slice(span.start, span.end)).toBe("Hello");
  });

  it("finds an indented mapping value", () => {
    const span = findValueSpan("  name: Foo Bar")!;
    expect(span.value).toBe("Foo Bar");
  });

  it("finds a sequence scalar item", () => {
    const span = findValueSpan("  - apple")!;
    expect(span.value).toBe("apple");
  });

  it("excludes a trailing inline comment from an unquoted value", () => {
    const span = findValueSpan("k: value # note")!;
    expect(span.value).toBe("value");
  });

  it("returns null for a block-opening key", () => {
    expect(findValueSpan("project:")).toBeNull();
  });

  it("returns null for a blank line", () => {
    expect(findValueSpan("   ")).toBeNull();
  });
});
