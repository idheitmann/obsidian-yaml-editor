# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Fold-state persistence for standalone `.yaml`/`.yml` files.** Folded
  sections are now saved per file and restored when the file is reopened or
  reloaded after an external change. Fold identity is based on YAML path
  (e.g. `dataview.milestones`), not line numbers — so folds survive line
  insertions, deletions, and external file modifications without landing on
  the wrong section. Fold state is persisted in plugin settings and debounced
  (500ms) to avoid excessive writes.

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
