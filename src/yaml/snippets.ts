import type { SnippetTemplate } from "../types";

/**
 * The built-in snippet catalog. These are the "easy schema element
 * instantiation" entries that show up in the Schema Palette regardless of
 * the active vault schema. Users can add their own via settings.
 *
 * Convention:
 *   ${1:placeholder}  - tab stops, in order
 *   ${TODAY}          - replaced with today's ISO date (yyyy-mm-dd)
 *   ${NOW}            - replaced with the current ISO datetime
 *   ${0}              - final cursor position
 */
export const BUILTIN_SNIPPETS: SnippetTemplate[] = [
  // Dates
  {
    id: "date.today",
    label: "today",
    hint: "today's date",
    tags: ["date"],
    body: "${TODAY}${0}",
  },
  {
    id: "date.now",
    label: "now",
    hint: "ISO datetime",
    tags: ["date"],
    body: "${NOW}${0}",
  },
  {
    id: "field.created",
    label: "created",
    hint: "created: <today>",
    tags: ["date", "obsidian"],
    body: "created: ${TODAY}\n${0}",
    topLevel: true,
  },
  {
    id: "field.modified",
    label: "modified",
    hint: "modified: <now>",
    tags: ["date", "obsidian"],
    body: "modified: ${NOW}\n${0}",
    topLevel: true,
  },

  // Obsidian-native frontmatter
  {
    id: "field.tags",
    label: "tags",
    hint: "list of tags",
    tags: ["obsidian"],
    body: "tags:\n  - ${1:tag}\n${0}",
    topLevel: true,
  },
  {
    id: "field.aliases",
    label: "aliases",
    hint: "list of aliases",
    tags: ["obsidian"],
    body: "aliases:\n  - ${1:alias}\n${0}",
    topLevel: true,
  },
  {
    id: "field.cssclasses",
    label: "cssclasses",
    hint: "CSS classes",
    tags: ["obsidian"],
    body: "cssclasses:\n  - ${1:class}\n${0}",
    topLevel: true,
  },
  {
    id: "field.publish",
    label: "publish",
    hint: "publish: true",
    tags: ["obsidian"],
    body: "publish: ${1|true,false|}\n${0}",
    topLevel: true,
  },

  // Generic structural
  {
    id: "shape.list",
    label: "list",
    hint: "key: [ items ]",
    tags: ["shape"],
    body: "${1:key}:\n  - ${2:item}\n${0}",
  },
  {
    id: "shape.map",
    label: "map",
    hint: "key: { nested }",
    tags: ["shape"],
    body: "${1:key}:\n  ${2:child}: ${3:value}\n${0}",
  },
  {
    id: "shape.list-of-maps",
    label: "list of maps",
    hint: "key: [ {...}, {...} ]",
    tags: ["shape"],
    body: "${1:key}:\n  - ${2:field}: ${3:value}\n${0}",
  },

  // Anchors / aliases
  {
    id: "yaml.anchor",
    label: "anchor",
    hint: "&name value",
    tags: ["yaml"],
    body: "&${1:name} ${0:value}",
  },
  {
    id: "yaml.alias",
    label: "alias",
    hint: "*name",
    tags: ["yaml"],
    body: "*${1:name}${0}",
  },

  // Dataview-shaped fields (light touch — these are conventions not requirements)
  {
    id: "dataview.project",
    label: "project (dataview)",
    hint: "project link",
    tags: ["dataview"],
    body: "project: \"[[${1:Project Note}]]\"\n${0}",
    topLevel: true,
  },
  {
    id: "dataview.due",
    label: "due (dataview)",
    hint: "due date",
    tags: ["dataview", "date"],
    body: "due: ${1:${TODAY}}\n${0}",
    topLevel: true,
  },
  {
    id: "dataview.status",
    label: "status (dataview)",
    hint: "status enum",
    tags: ["dataview"],
    body: "status: ${1|todo,doing,done,blocked|}\n${0}",
    topLevel: true,
  },
];

/** Substitute date placeholders. Tab stops are left intact for the editor. */
export function expandDatePlaceholders(body: string, now: Date = new Date()): string {
  const today = now.toISOString().slice(0, 10);
  const nowIso = now.toISOString();
  return body.replace(/\$\{TODAY\}/g, today).replace(/\$\{NOW\}/g, nowIso);
}

/**
 * Convert a snippet body written in our LSP-ish dialect into the syntax that
 * CodeMirror's `snippet()`/`snippetCompletion()` understands.
 *
 * CodeMirror supports `${1:label}`, `${1}`, `${label}`, and `${}` fields, but
 * NOT VS Code's choice syntax `${1|a,b|}` or the `${0}` final-tab-stop marker.
 * We normalise both: choices collapse to their first option, and `${0}` markers
 * are dropped (CM ends at the last field, which is the desired behaviour).
 */
export function toCodeMirrorSnippet(body: string): string {
  return body
    // ${1|a,b,c|}  ->  ${1:a}
    .replace(/\$\{(\d+)\|([^|}]*)\|\}/g, (_m, n: string, opts: string) => `\${${n}:${opts.split(",")[0]}}`)
    // ${0} or ${0:...}  ->  (removed; CM has no explicit final stop)
    .replace(/\$\{0(?::[^}]*)?\}/g, "");
}

/**
 * Strip all tab-stop markers from a snippet body, leaving plain text. Used by
 * insertion paths that can't drive an interactive snippet (the palette modal,
 * which goes through Obsidian's Editor API rather than CodeMirror).
 */
export function stripSnippetMarkers(body: string): string {
  return body
    // ${1|a,b|} -> a
    .replace(/\$\{\d+\|([^|}]*)\|\}/g, (_m, opts: string) => opts.split(",")[0] ?? "")
    // ${1:default} -> default
    .replace(/\$\{\d+:([^}]*)\}/g, "$1")
    // ${1} / ${0} -> (removed)
    .replace(/\$\{\d+\}/g, "");
}
