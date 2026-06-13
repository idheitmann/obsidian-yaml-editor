# YAML Editor — Specification

> A focused YAML editing *mode* for Obsidian. Not a generic text editor with YAML highlighting — a tool that knows it's editing YAML and behaves accordingly.

## Vision

YAML is the connective tissue of an Obsidian vault. Frontmatter drives Dataview, Properties, Templater, Tasks, and a hundred community plugins. Embedded YAML blocks describe configuration, examples, and structured data inside notes. But editing YAML by hand is fragile: indentation matters, special characters break parsing, anchors are arcane, and you can't tell whether `tags: foo` is a string or the start of a list until you remember.

This plugin makes YAML editing feel like a structured editor, not a text editor — without giving up the speed of typing. The cursor always knows where it is in the document tree. The keys you can add at the current level are one keystroke away. Indentation is automatic and correct. Special characters are escaped when they need to be. Anchors and aliases stop being arcane.

It works in two places:
1. **Frontmatter** — the `---` block at the top of a note.
2. **YAML code blocks** — fenced blocks tagged ` ```yaml ` (and ` ```yml `).

## Design Principles

1. **Structural, not syntactic.** Every interaction is informed by a live YAML AST. Completions, affordances, and shortcuts know the path of the cursor, not just its column.
2. **Quiet by default.** The editor doesn't decorate aggressively. Hints, ghost text, and gutter affordances appear only when they earn their pixels — usually on the cursor's line, or when invoked.
3. **Keystroke-first, mouse-available.** Every affordance has a keyboard equivalent. The mouse is for discoverability; the keyboard is for speed.
4. **Honor the user's text.** Don't reformat. Don't reorder keys. Don't strip comments. Round-trip preservation is non-negotiable; a save should diff cleanly against the user's hand-written original wherever possible.
5. **Schema is inferred, then refined.** Start from what's in the document and what other notes in the vault use. Allow explicit schema declarations to sharpen completions, but never require them.

## Core Features

### 1. YAML Syntax Editor
- Real-time parse on every change with `eemeli/yaml`'s CST + AST parser.
- Diagnostics surface as the gutter mark + an unobtrusive underline.
- Auto-quoting: when a value contains `:`, `#`, `[`, `]`, `{`, `}`, leading whitespace, or YAML-reserved scalars (`yes`/`no`/`on`/`off`/`true`/`false`/`null`/`~`), the editor inserts the minimal correct quoting.
- Auto-indent on Enter inside a block scalar, mapping value, or sequence.
- Smart `Tab` / `Shift+Tab` only adjusts indent in YAML regions, in 2-space steps.

### 2. Schema-Aware Editing
- A `SchemaTracker` watches all YAML regions across the vault and builds a probabilistic schema:
  - For each path (e.g. `tags[]`, `created`, `dataview.project`), it records observed value types, frequencies, and example values.
- The cursor's current path is computed from the AST. The status bar shows the path; completions and the palette filter to keys not yet present at that path.
- Optional explicit schemas:
  - A `.obsidian/yaml-schemas/` folder holds JSON Schema files.
  - A note can opt into a schema with `# yaml-schema: <name>` (in a code block) or `_schema: <name>` (in frontmatter).
- Schemas drive: key completions, value enums, type validation, and palette grouping.

### 3. Multi-level Shape Support
- Arbitrary nesting via the AST — no depth limits.
- Indentation moves are *structural*, not character-based: `Tab` on a key promotes/demotes the whole subtree.
- Folding gutter on map/sequence boundaries.
- Cursor "breadcrumbs" in the status bar: `frontmatter › project › milestones[2] › title`.

### 4. Intuitive Affordances
- **Inline gutter `+` button** on each map/sequence line — opens the palette scoped to that level.
- **Ghost-text hint** at end of line when a completion is high-confidence (e.g. `tags: ` shows a faded `[ ]` suggestion).
- **Context menu** (right-click in YAML region):
  - Insert sibling key…
  - Insert child key…
  - Convert scalar → list / list → map / map → list of maps
  - Quote / unquote value
  - Extract anchor / link to alias
  - Sort keys (case-insensitive, comments preserved)
- **Command palette commands** (all keymap-bindable):
  - YAML: Insert element here…
  - YAML: Insert frontmatter
  - YAML: Toggle list/scalar
  - YAML: Add anchor on current node
  - YAML: Reference an existing anchor
  - YAML: Format YAML region
  - YAML: Go to key…

### 5. Easy Schema Element Instantiation
- A **Schema Palette** (default `Cmd/Ctrl+Shift+Y`) — a `SuggestModal` listing:
  - Keys observed at the current path elsewhere in the vault
  - Keys defined by an active explicit schema
  - **Snippets** for common Obsidian elements:
    - `created: <today>` / `modified: <now>` (ISO 8601, today's date)
    - `tags: [ ]` (with a tag-completion follow-up)
    - `aliases: [ ]`
    - `cssclasses: [ ]`
    - Dataview field stubs (numeric, date, link, list)
    - Tasks plugin stubs
    - Custom user-defined snippets from settings
- Each entry inserts a templated structure with tab stops, leveraging CodeMirror's snippet API.

## Architecture

```
src/
  main.ts                  # plugin entry, lifecycle, command registration
  types.ts                 # cross-cutting types
  settings.ts              # settings tab + persistence
  yaml/
    regions.ts             # locate frontmatter + ```yaml blocks in a doc
    parser.ts              # eemeli/yaml wrapper, AST + CST
    path.ts                # cursor offset → YAML path
    schema.ts              # SchemaTracker (vault-wide inference)
    snippets.ts            # built-in snippet catalog
  editor/
    extension.ts           # CodeMirror 6 extension factory
    state.ts               # StateField holding parsed YAML regions
    completions.ts         # autocomplete source
    affordances.ts         # gutter + ghost text widgets
    indent.ts              # smart Tab / Enter / list-bullet handlers
    keymap.ts              # default keybindings
    decorations.ts         # quiet visual affordances
  ui/
    palette.ts             # Schema Palette (SuggestModal)
    quickadd.ts            # one-shot inserters (today, anchor, alias)
```

### Data flow

```
document edit
   │
   ▼
StateField (yamlState) ── recomputes regions + parses each region
   │
   ├── completions.ts  ── reads cursor path → suggests keys/values
   ├── affordances.ts  ── reads region → renders gutter + ghost text
   ├── decorations.ts  ── reads region → renders quiet hints
   └── SchemaTracker   ── observes parsed regions → updates vault schema
```

The `SchemaTracker` is the only piece with vault scope; everything else is per-editor and per-edit.

## Non-goals

- A general structured-data editor (JSON, TOML). YAML only.
- Reformatting on save. We keep the user's whitespace.
- A linter ruleset à la `yamllint`. We surface parse errors, not style.
- Full JSON-Schema reference resolution (`$ref` to remote URLs). Local refs only.

## Open questions (intentionally deferred)

- How to surface schema *violations* without being annoying. (Today: gutter mark + hover.)
- Whether to auto-add the `---` fences when invoking "Insert frontmatter" inside a note that doesn't have any.
- Whether the Schema Palette should learn from acceptance/rejection over time.
