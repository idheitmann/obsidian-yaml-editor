import { describe, it, expect } from "vitest";
import { parseDocument } from "yaml";
import { classifyValue, pathKey, parseRegion } from "../src/yaml/parser";

describe("pathKey", () => {
  it("renders an empty path as the empty string", () => {
    expect(pathKey([])).toBe("");
  });

  it("joins map keys with dots", () => {
    expect(pathKey(["a", "b", "c"])).toBe("a.b.c");
  });

  it("collapses sequence indices to []", () => {
    expect(pathKey(["a", 0, "b"])).toBe("a[].b");
    expect(pathKey([2])).toBe("[]");
    expect(pathKey(["tags", 3])).toBe("tags[]");
  });
});

describe("classifyValue", () => {
  const doc = parseDocument(
    [
      "bool: true",
      "int: 3",
      "float: 3.5",
      "str: hello",
      "date: 2020-01-02",
      "datetime: 2020-01-02T10:00:00",
      "nul: null",
      "list: [1, 2]",
      "map: {x: 1}",
    ].join("\n"),
  );
  const kind = (key: string) => classifyValue(doc.get(key, true));

  it("classifies scalars by type", () => {
    expect(kind("bool")).toBe("boolean");
    expect(kind("int")).toBe("integer");
    expect(kind("float")).toBe("number");
    expect(kind("str")).toBe("string");
    expect(kind("nul")).toBe("null");
  });

  it("classifies ISO date and datetime strings", () => {
    expect(kind("date")).toBe("date");
    expect(kind("datetime")).toBe("datetime");
  });

  it("classifies collections", () => {
    expect(kind("list")).toBe("list");
    expect(kind("map")).toBe("map");
  });
});

describe("parseRegion", () => {
  it("returns no errors for valid YAML", () => {
    expect(parseRegion("a: 1\nb: 2\n").errors).toHaveLength(0);
  });

  it("surfaces parse errors with positions for invalid YAML", () => {
    const { errors } = parseRegion("a: [1, 2\n");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toHaveProperty("message");
    expect(typeof errors[0]!.from).toBe("number");
  });
});
