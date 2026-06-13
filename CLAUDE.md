# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An Obsidian community plugin that turns YAML editing (frontmatter `---` blocks and ```` ```yaml ```` code blocks) into a structured-editing experience: schema-aware completions, a snippet palette, and structural affordances — without reformatting the user's text. The full product intent lives in [SPEC.md](SPEC.md); read it before adding features, and treat its **Design Principles** and **Non-goals** as binding constraints (notably: round-trip preservation — never reformat, reorder keys, or strip comments on save).

## Commands

- `npm run dev` — esbuild watch mode; rebuilds `main.js` on change. No HMR — reload the plugin in Obsidian to see changes.
- `npm run build` — typecheck (`tsc -noEmit`) then production esbuild bundle.
- `npm run typecheck` — type-check only.

There is **no test runner and no linter configured**. `tsc --strict` is the only automated check. The build entry point is `src/main.ts` → bundled to `main.js` (gitignored; it's the loadable artifact Obsidian reads alongside `manifest.json` and `styles.css`).

To test in a real vault, symlink/copy `main.js`, `manifest.json`, `styles.css` into `<vault>/.obsidian/plugins/yaml-editor/`.

## Architecture

The plugin has two cooperating layers plus one vault-wide service. Understanding the split is the key to working here:

1. **CodeMirror 6 editor extension** (`src/editor/`) — per-editor, per-keystroke behavior. Registered via `registerEditorExtension(yamlEditorExtension(plugin))` in [src/main.ts](src/main.ts). This is where completions, decorations, and the Tab/indent keymap live. Uses raw CodeMirror APIs and offsets.
2. **Obsidian command/UI layer** (`src/ui/`, command handlers in `main.ts`) — discrete user-invoked actions (palette modal, format/goto/quote/anchor commands). The command *logic* lives in [src/editor/commands.ts](src/editor/commands.ts) and operates on a CodeMirror `EditorView` (offsets), so it works in both editing surfaces. `main.ts` registers each via `addYamlCommand` → `checkCallback`, resolving the active view with `resolveCmView()` (a `MarkdownView`'s `editor.cm`, or `YamlFileView.cmView`). `insertFrontmatter` ([src/ui/quickadd.ts](src/ui/quickadd.ts)) is the one remaining Obsidian-`Editor` action (Markdown-only). Don't reintroduce `editorCallback` for YAML actions — it never fires in the standalone file view.
3. **`SchemaTracker`** ([src/yaml/schema.ts](src/yaml/schema.ts)) — the only vault-scoped piece. Scans the YAML in every `.md` (frontmatter + fences) **and** standalone `.yaml`/`.yml` file (whole-document), folds observed `(path → kinds, examples, count)` into a probabilistic schema, and updates incrementally on vault modify/create/delete/rename events (`SCANNED_EXTENSIONS`). Both layers query it via `keysAt(path)`.

### The core data flow

Every doc edit recomputes editor state in one place: `yamlStateField` ([src/editor/state.ts](src/editor/state.ts)). On `docChanged` (and on `create`) it calls `yamlRegions(state)` → `parseRegion` for each region and stores regions + per-region parse errors. Downstream consumers (`completions`, `affordances`, `decorations`, the `linter`, fold/breadcrumb) read this field or call `yamlRegions(state)` — **don't** call `findYamlRegions(doc)` directly in editor code, or the standalone-file mode (below) won't apply.

### Two editing surfaces, one code path

The plugin edits YAML in two places: **inside Markdown** (frontmatter + ```yaml fences, via `registerEditorExtension`) and **standalone `.yaml`/`.yml` files** (`YamlFileView`, a `TextFileView` hosting its own CodeMirror, registered via `registerExtensions` in [src/main.ts](src/main.ts)). Both share the same editor extensions. The difference is the **`wholeDocYaml` facet** ([src/editor/mode.ts](src/editor/mode.ts)): when set (only in `YamlFileView`), `yamlRegions(state)` returns the entire document as one region instead of scanning for fences. Always go through `yamlRegions(state)` so both surfaces stay in sync.

### The two YAML-understanding primitives

- **`findYamlRegions(doc)`** ([src/yaml/regions.ts](src/yaml/regions.ts)) — pure string scan that locates frontmatter + fenced YAML and returns `{from, to, text, kind}`. Cheap; called on every change. Wrapped by `yamlRegions(state)` ([src/editor/mode.ts](src/editor/mode.ts)) which adds the whole-document mode — editor code should call the wrapper, not this directly. Everything operates on a region's local `text` and translates back via `region.from`.
- **`probeAt(text, offset)`** ([src/yaml/path.ts](src/yaml/path.ts)) — resolves the structural path at a cursor (e.g. `dataview › milestones[2] › title`) by an **indentation-stack walk of the lines, not the AST**. This is deliberate: the cursor is usually on an incomplete/blank line the parser can't represent yet. The `eemeli/yaml` AST (`parseRegion`) is used only for whole-region analysis (schema inference, error reporting). Know which one you need: live cursor context → `probeAt`; analyzing committed structure → AST. `probeAt` does not handle flow-style `{...}`/`[...]`.

Path identity across the codebase is the string form from `pathKey()` ([src/yaml/parser.ts](src/yaml/parser.ts)): `dataview.tasks[].title` (sequence indices collapse to `[]`). The `SchemaTracker` keys on this.

### Two schema sources

Completions and the palette draw from both: the inferred `SchemaTracker` (above) and **explicit JSON Schemas**. `SchemaStore` ([src/yaml/schemastore.ts](src/yaml/schemastore.ts)) loads `*.json` from the configured dir via the vault *adapter* (the dir is under `.obsidian/`, outside `getFiles()`), keyed by basename and `$id`. A region opts in via `resolveSchemaName(text)` (top-level `_schema:` or a `# yaml-schema:` comment). Navigation of the schema (`schemaAtPath`/`propertiesAt`/`enumAt`, with local `$ref` deref only) is pure and tested in [src/yaml/jsonschema.ts](src/yaml/jsonschema.ts). Schema-derived completions are ranked above inferred ones (`boost`).

## Conventions & gotchas

- **Two settings definitions exist.** `main.ts` defines the live `PluginSettings` interface + `DEFAULT_SETTINGS` it actually uses; [src/settings.ts](src/settings.ts) has an unused `PluginSettings` class. Edit the one in `main.ts`.
- **Snippet bodies use `${1:placeholder}` tab-stop syntax** (CodeMirror snippet format) defined in [src/yaml/snippets.ts](src/yaml/snippets.ts). `expandDatePlaceholders` only substitutes `${TODAY}`/`${NOW}` and leaves tab stops intact — so a body inserted via a plain `replaceRange`/`changes` will leak literal `${1:...}` text. Insertion paths must go through CodeMirror's snippet API (or strip tab stops) for these to work.
- **Indentation is fixed at 2 spaces** (`indentUnit.of("  ")`, the `INDENT` const in [src/editor/keymap.ts](src/editor/keymap.ts)). Tab/Shift-Tab and Enter only adjust indent inside YAML regions and fall through to default behavior elsewhere.
- The keymap's `yamlEnter`/`yamlTab` handlers delegate their decision to pure helpers (`computeEnter` in [src/editor/indent.ts](src/editor/indent.ts)) so the logic is unit-tested. Follow this pattern: keep editor-edit *decisions* pure and tested; the keymap/command just applies the result. Same for quoting ([src/yaml/quote.ts](src/yaml/quote.ts)), folding ([src/yaml/fold.ts](src/yaml/fold.ts)), breadcrumbs and key-location ([src/yaml/path.ts](src/yaml/path.ts)).
- **Quoting is correct-YAML, not literal-spec.** `needsQuoting` only flags `: `/` #`/leading-indicator/reserved cases — it deliberately does NOT quote every value containing a `:` (URLs stay bare). Exposed as the explicit "Toggle quotes on value" command rather than live auto-quoting (honors the user's text; avoids surprise edits mid-type).
- **Folding** is contributed via `foldService.of(...)` only ([src/editor/extension.ts](src/editor/extension.ts)) — it relies on Obsidian's existing fold gutter/state rather than adding our own `codeFolding()`/`foldGutter()` (which would duplicate Obsidian's and conflict).
- Decoration `StateField`s must expose themselves via `provide: f => EditorView.decorations.from(f)` to render. `decorations.ts` and `affordances.ts` do this; verify any new decoration field does too.

## Manifest / release

`manifest.json` (`id`, `version`, `minAppVersion`) is the source of truth Obsidian reads. A release requires `main.js`, `manifest.json`, `styles.css`, and a `versions.json` mapping plugin version → minimum app version (not yet present in the repo).
