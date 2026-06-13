import type { YamlPath } from "../types";

/**
 * A loose JSON Schema shape — enough of Draft 7 / 2020-12 to drive completions.
 * We only resolve *local* `$ref`s (`#/$defs/...`, `#/definitions/...`); remote
 * refs are out of scope (see SPEC non-goals).
 */
export interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema | JsonSchema[];
  required?: string[];
  enum?: unknown[];
  description?: string;
  additionalProperties?: boolean | JsonSchema;
  $ref?: string;
  $id?: string;
  $defs?: Record<string, JsonSchema>;
  definitions?: Record<string, JsonSchema>;
  [key: string]: unknown;
}

export interface SchemaProp {
  key: string;
  type?: string;
  description?: string;
  enum?: string[];
  required: boolean;
}

/** Resolve a local `$ref` chain; returns the schema itself if it has no ref. */
function deref(schema: JsonSchema | undefined, root: JsonSchema, seen = new Set<string>()): JsonSchema | null {
  if (!schema || typeof schema !== "object") return null;
  const ref = schema.$ref;
  if (typeof ref === "string" && ref.startsWith("#/")) {
    if (seen.has(ref)) return null;
    seen.add(ref);
    const target = resolvePointer(root, ref.slice(2).split("/"));
    return target ? deref(target, root, seen) : null;
  }
  return schema;
}

function resolvePointer(root: JsonSchema, parts: string[]): JsonSchema | null {
  let cur: unknown = root;
  for (const part of parts) {
    const key = part.replace(/~1/g, "/").replace(/~0/g, "~");
    if (cur && typeof cur === "object" && key in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[key];
    } else {
      return null;
    }
  }
  return (cur && typeof cur === "object" ? (cur as JsonSchema) : null);
}

/** Navigate to the subschema at a YAML path, following `properties`/`items`. */
export function schemaAtPath(root: JsonSchema, path: YamlPath): JsonSchema | null {
  let cur = deref(root, root);
  for (const seg of path) {
    if (!cur) return null;
    if (typeof seg === "number") {
      const items = cur.items;
      cur = Array.isArray(items) ? deref(items[seg] ?? items[0], root) : deref(items, root);
    } else if (cur.properties && cur.properties[seg]) {
      cur = deref(cur.properties[seg], root);
    } else if (cur.additionalProperties && typeof cur.additionalProperties === "object") {
      cur = deref(cur.additionalProperties, root);
    } else {
      return null;
    }
  }
  return cur;
}

/** The declared properties of the object at `path` (for key completions). */
export function propertiesAt(root: JsonSchema, path: YamlPath): SchemaProp[] {
  const schema = schemaAtPath(root, path);
  if (!schema || !schema.properties) return [];
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  return Object.entries(schema.properties).map(([key, raw]) => {
    const sub = deref(raw, root) ?? {};
    return {
      key,
      type: typeName(sub),
      description: typeof sub.description === "string" ? sub.description : undefined,
      enum: enumStrings(sub),
      required: required.has(key),
    };
  });
}

/** Allowed enum values for the scalar at `path` (for value completions). */
export function enumAt(root: JsonSchema, path: YamlPath): string[] | null {
  const schema = schemaAtPath(root, path);
  if (!schema) return null;
  const direct = enumStrings(schema);
  if (direct) return direct;
  // A sequence whose items are an enum (e.g. `status: [todo, done]` lists).
  if (schema.items && !Array.isArray(schema.items)) {
    const items = deref(schema.items, root);
    if (items) return enumStrings(items) ?? null;
  }
  return null;
}

function typeName(schema: JsonSchema): string | undefined {
  if (Array.isArray(schema.type)) return schema.type.join(" | ");
  if (typeof schema.type === "string") return schema.type;
  if (schema.enum) return "enum";
  return undefined;
}

function enumStrings(schema: JsonSchema): string[] | undefined {
  if (!Array.isArray(schema.enum)) return undefined;
  return schema.enum.map((v) => (v === null ? "null" : String(v)));
}

/**
 * Determine which schema a region opts into:
 *   - a top-level `_schema: name` key (frontmatter / standalone files)
 *   - a `# yaml-schema: name` comment (anywhere, e.g. in a code block)
 * Returns the schema name, or null.
 */
export function resolveSchemaName(regionText: string): string | null {
  for (const raw of regionText.split("\n")) {
    const trimmed = raw.trim();
    if (trimmed === "") continue;
    const comment = /^#\s*yaml-schema:\s*(\S.*)$/.exec(trimmed);
    if (comment) return unquoteName(comment[1]!);
    if (raw === trimmed) {
      // unindented → a top-level key
      const key = /^_schema:\s*(\S.*)$/.exec(trimmed);
      if (key) return unquoteName(key[1]!);
    }
  }
  return null;
}

function unquoteName(value: string): string {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}
