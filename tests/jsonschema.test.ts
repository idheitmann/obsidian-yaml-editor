import { describe, it, expect } from "vitest";
import { propertiesAt, enumAt, schemaAtPath, resolveSchemaName, type JsonSchema } from "../src/yaml/jsonschema";

const SCHEMA: JsonSchema = {
  type: "object",
  required: ["title"],
  properties: {
    title: { type: "string", description: "The note title" },
    status: { enum: ["todo", "doing", "done"] },
    tags: { type: "array", items: { type: "string" } },
    dataview: {
      type: "object",
      properties: {
        project: { $ref: "#/$defs/link" },
        priority: { enum: [1, 2, 3] },
      },
    },
    milestones: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          state: { enum: ["open", "closed"] },
        },
      },
    },
  },
  $defs: {
    link: { type: "string", description: "A wikilink" },
  },
};

describe("propertiesAt", () => {
  it("lists top-level properties with type and required flags", () => {
    const props = propertiesAt(SCHEMA, []);
    const title = props.find((p) => p.key === "title")!;
    expect(title.type).toBe("string");
    expect(title.required).toBe(true);
    expect(title.description).toBe("The note title");
    expect(props.find((p) => p.key === "status")!.required).toBe(false);
  });

  it("lists nested object properties", () => {
    const keys = propertiesAt(SCHEMA, ["dataview"]).map((p) => p.key);
    expect(keys).toEqual(["project", "priority"]);
  });

  it("lists properties of array item objects", () => {
    const keys = propertiesAt(SCHEMA, ["milestones", 0]).map((p) => p.key);
    expect(keys).toEqual(["name", "state"]);
  });

  it("returns nothing for a path that isn't an object", () => {
    expect(propertiesAt(SCHEMA, ["title"])).toEqual([]);
  });
});

describe("enumAt", () => {
  it("returns enum values for a scalar", () => {
    expect(enumAt(SCHEMA, ["status"])).toEqual(["todo", "doing", "done"]);
  });

  it("stringifies non-string enums", () => {
    expect(enumAt(SCHEMA, ["dataview", "priority"])).toEqual(["1", "2", "3"]);
  });

  it("resolves enums inside array item objects", () => {
    expect(enumAt(SCHEMA, ["milestones", 0, "state"])).toEqual(["open", "closed"]);
  });

  it("returns null when there is no enum", () => {
    expect(enumAt(SCHEMA, ["title"])).toBeNull();
  });
});

describe("schemaAtPath with $ref", () => {
  it("follows local $ref", () => {
    const s = schemaAtPath(SCHEMA, ["dataview", "project"]);
    expect(s?.description).toBe("A wikilink");
  });
});

describe("resolveSchemaName", () => {
  it("reads a top-level _schema key", () => {
    expect(resolveSchemaName("_schema: book\ntitle: Hi\n")).toBe("book");
  });

  it("reads a quoted _schema value", () => {
    expect(resolveSchemaName('_schema: "my schema"\n')).toBe("my schema");
  });

  it("reads a # yaml-schema comment", () => {
    expect(resolveSchemaName("# yaml-schema: config\nkey: 1\n")).toBe("config");
  });

  it("ignores an indented _schema (not top-level)", () => {
    expect(resolveSchemaName("nested:\n  _schema: x\n")).toBeNull();
  });

  it("returns null when no directive is present", () => {
    expect(resolveSchemaName("title: Hi\ntags: [a]\n")).toBeNull();
  });
});
