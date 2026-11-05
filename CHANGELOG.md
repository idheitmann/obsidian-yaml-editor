# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Folds are remembered** in standalone `.yaml` files: when you close a file,
  switch files or restart, and when the file changes on disk. A fold is saved
  as the node it collapses (its full path, like `tasks[1].sub`, plus a
  fingerprint), not a line number, so it follows a list item after items are
  inserted above it or the list is reordered. A fold that can't be placed with
  confidence is dropped rather than guessed. Nothing is written into the YAML.

### Fixed

- **The plugin loads on iOS before 16.4.** The rendered view's inline-markdown
  tokenizer used regex lookbehinds, which older Safari can't parse; since the
  regex is compiled at load, the whole plugin failed there. The same matching
  is now done without them.
- Cleared Obsidian review warnings: Obsidian's `createEl` helpers instead of
  `document.createElement`, no console logging on load/unload, and no
  redundant type assertions.

## [1.1.0] — 2026-11-04

### Added

- **Rendered view for standalone `.yaml` files.** A header button (or "YAML:
  Toggle rendered view") switches a file between the editor and a read-only
  report: headings, label tables, records, legends and summary tables, laid out
  from the data's shape with no schema needed. A top-level `_view:` block can
  steer it (title, intro, section order, labels, record headlines and
  narrative, pivot tables); see [RENDER.md](RENDER.md). Colours follow the
  theme, vault paths are clickable, and the view updates as the file changes.
  Files with a `_view:` block open rendered by default (setting "Open reports
  in rendered view"); a mode picked with the toggle is remembered by the pane.
- **YAML: Render to HTML file** writes a static page next to the YAML, with
  fixed colours and only paste-safe markup, so it pastes cleanly into Word or
  Google Docs or opens in Drive as a Google Doc. `npm run render` does the same
  from the terminal, with `--docx` for a Word file.

- **Structural editing.** Every command below changes only the lines it
  restructures; comments, blank lines and formatting elsewhere are untouched.
  A node's subtree and the comments directly above it move with it.
  - **Move node up/down** (`Alt+↑` / `Alt+↓`, or the "Move node" commands):
    swaps a key or list item with its sibling instead of the neighboring line.
  - **Tab / Shift+Tab on a key or list item** indents or outdents its whole
    subtree. Elsewhere (block-scalar text, comments) it still moves one line.
    Outdenting is logical: when siblings follow the node, it moves to just
    after its parent's block instead of capturing them as children, and an
    outdent that wouldn't parse is refused with a notice.
  - **Sort keys at this level**: case-insensitive, comments kept with their
    keys. Refuses if the parsed data would change.
  - **Shape conversions**: value → block list, list → map (plain values become
    keys; a list holding one map is unwrapped), map → list of maps.
  - **Right-click menu** in YAML, in notes and in standalone `.yaml` files:
    insert sibling or child key (opens the palette on a new line at the right
    indent), the conversions, sort keys, quote/unquote, extract anchor, link to
    alias. Only the entries that apply at the cursor are shown.

## [1.0.5] — 2026-11-02

### Added

- **Hanging indent for wrapped YAML lines.** Soft-wrapped lines now continue
  under the start of their own content instead of the left margin, so a long
  wrapped value no longer looks like a new top-level key. Leading spaces and
  `- ` sequence markers count as structural, so a wrapped list item aligns
  under its own text. Scoped to YAML regions; toggleable via the "Align wrapped
  lines" setting.

### Fixed

- **"Toggle quotes" quotes values starting with `[` again.** A regression in
  1.0.1 dropped `[` from the leading-indicator check, so such a value was left
  bare and YAML read it as an unclosed flow list.
- **Multi-document files are no longer flagged as errors.** A standalone file
  with several `---`-separated documents (e.g. Kubernetes manifests) is valid
  YAML; it no longer reports "Source contains multiple documents," and every
  document now contributes to the inferred schema.
- **Fresh installs work.** `obsidian` was pinned to `latest`, which drifted into
  a peer conflict with the CodeMirror packages and broke `npm ci`. It is now
  pinned to 1.12.3, with `@codemirror/state` and `@codemirror/view` pinned to
  the versions it expects.

### Changed

- Tests, typecheck and build run in CI on every push and pull request.


## [1.0.4] — 2026-07-03

### Fixed

- **Autocomplete no longer suggests keys in value position.** Key completions
  (inferred schema, explicit schema, and snippets) are now suppressed when the
  cursor is in value position (`key: |`) or on a sequence item line (`  - |`).
- **Autocomplete value suggestions now reflect the key being edited.** The
  inferred-schema value suggestions were looking up the most-frequent key at the
  current path level and showing *its* examples regardless of what key the cursor
  was on. Now they look up examples for the actual key: scalar-value position
  (`related: |`) fetches observed examples for `related`; sequence-item position
  (`  - |` inside a list) fetches examples for the parent key's `[]` items.
- **Autocomplete no longer triggers on bare `:`** — value completions now only
  appear after `key: ` (colon + space), or on an explicit Ctrl+Space. The
  completion `from` offset is set to the start of the value token so that
  accepting a suggestion inserts cleanly and typing narrows the list rather than
  dismissing it.
- **Path detection for compact-notation sequences.** `probeAt` previously
  mis-attributed sequence items to the wrong parent when the `- ` indicator sat
  at the same indent level as its parent key (e.g. `users:\n- item`). The indent
  stack now keeps the same-indent key frame as the compact parent instead of
  popping it, so inferred-schema lookups resolve to the correct path
  (`everhour.users[].email` rather than `everhour[].email`).
- **Tab now indents instead of replacing indent.** The `yamlTab` handler was
  replacing the entire leading whitespace with 2 spaces, which outdented any line
  already indented more than 2 levels. Tab now inserts 2 spaces at the line start;
  Shift+Tab removes up to 2.

## [1.0.3] — 2026-06-29

### Fixed

- **Remove settings heading** ([scanner error]). The settings tab had a
  `setName("General").setHeading()` call that the community scanner flagged as
  unnecessary — removed entirely, leaving the first setting group unlabeled
  (matching Obsidian's own plugin settings convention).

## [1.0.2] — 2026-06-29

### Fixed

- **Remove unnecessary `!` assertions** — 6 remaining non-null assertions in
  `quote.ts`, `regions.ts`, and `schema.ts` that the scanner considered
  superfluous given TypeScript's index access types.
- **CSS compatibility** — replaced `text-decoration-line` / `text-decoration-style`
  / `text-decoration-color` individual properties with `border-bottom: 2px wavy`
  to avoid the "partially supported" scanner warning for Obsidian 1.4.5's
  rendering engine.

## [1.0.1] — 2026-06-29

### Added

- **MIT LICENSE file** to the repository root.

### Fixed

- **Remove "Obsidian" from plugin description** ([scanner error]). The
  `manifest.json` description text contained the word "Obsidian", which is
  redundant in the context of the plugin directory.
- **Replace HTML headings with `Setting.setHeading()`** ([scanner error]).
  `containerEl.createEl("h2")` and `createEl("h3")` calls in the settings tab
  were replaced with `new Setting(containerEl).setName(...).setHeading()` to
  use Obsidian's native settings API.
- **Replace `builtin-modules` with `node:module`**. The esbuild config imported
  from the npm package `builtin-modules`; replaced with `node:module`'s native
  `builtinModules` to drop the dependency.
- **Use `activeDocument` for popout window compatibility**. Three
  `document.createElement()` calls in `affordances.ts` and `main.ts` were
  replaced with `activeDocument.createElement()` so the plugin works in
  Obsidian popout windows.
- **Use `Vault#configDir` instead of hardcoded `.obsidian`**. The default
  schema directory path `.obsidian/yaml-schemas/` was changed to
  `yaml-schemas/` (relative), and the `SchemaStore` now resolves relative
  paths against `this.app.vault.configDir` at runtime.
- **Type `loadData()` result** — the `super.loadData()` call in
  `loadSettings()` was typed from untyped `any` to
  `Partial<PluginSettings> | null` to avoid the unsafe-assignment warning.
- **Clean up unnecessary regex escapes** — removed superfluous backslashes
  before `{`, `}`, `?`, and `[` inside character classes in `path.ts` and
  `quote.ts`.
- **Remove unnecessary `!` type assertions** — 13 non-null assertions across
  `affordances.ts`, `completions.ts`, `state.ts`, `fold.ts`, `jsonschema.ts`,
  and `path.ts` were removed.
- **Remove unused imports** — `yamlEditorState`, `findYamlRegions`, and
  `SnippetTemplate` imports that were defined but never referenced.

## [1.0.0] — 2026-06-29

### Added

- Community plugin release prep. This is the first public release of YAML
  Editor, an Obsidian plugin that turns YAML editing into a structured-editing
  experience: schema-aware completions, a snippet palette, and structural
  affordances — without reformatting the user's text.
- Schema-aware completions from two sources: inferred schema (vault-wide
  scanning of `.md` frontmatter, ```` ```yaml ```` code blocks, and standalone
  `.yaml`/`.yml` files) and explicit JSON Schemas (loaded from a configurable
  directory, opted in via `_schema:` key or `# yaml-schema:` comment).
- Snippet palette for inserting common YAML structures.
- Smart Tab/Shift-Tab and Enter keybindings scoped to YAML regions (2-space
  indent).
- Indentation-based code folding for YAML regions.
- Toggle-quotes command for values (correct-YAML quoting rules, not
  literal-spec).
- Format, go-to-key, add-anchor, and reference-anchor commands.
- Dedicated editing surface for standalone `.yaml`/`.yml` files via
  `YamlFileView` (shares all editor extensions with the Markdown YAML
  surface via the `wholeDocYaml` facet).
- Status-bar breadcrumb showing the cursor's YAML path.
- Lint diagnostics for YAML parse errors.
