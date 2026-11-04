# Roadmap

**Status:** proposed 2026-11-02, revised 2026-11-04 after 1.1 landed on `main` with an unplanned rendered view. Nothing here is committed to until it's merged; reorder, cut or add freely.

YAML Editor should be the editor anyone working with YAML in Obsidian reaches for: structure-aware, fast on real files, and never touching text it wasn't asked to touch. Since 1.1 it also reads YAML: a file can open as a report instead of as source.

## How each item is judged

1. **Round-trip preservation.** Every new command changes only the text it targets. Tests prove that everything else, comments and blank lines included, is byte-identical afterward.
2. **Quiet by default.** New hints and checks earn their pixels or stay off.
3. **Decisions in pure functions.** Logic lives in tested helpers; commands and keymaps only apply the result. This is already the convention in CLAUDE.md.
4. **Offline.** The plugin makes no network requests, which keeps it simple to trust and to review. Keep it that way.

## At a glance

| version | theme | state |
|---|---|---|
| 1.0.5 | Repair | released |
| 1.1 | Structural editing and the rendered view | on `main`, unreleased |
| 1.2 | Navigation that holds up | next |
| 1.3 | Schemas | planned |
| later | Smaller gaps | |

## 1.0.5: Repair (released)

Quoting fix, multi-document files no longer flagged as errors, pinned dependencies so `npm ci` works, CI on every push, hanging indent, and the community-directory listing.

## 1.1: Structural editing and the rendered view (on `main`)

Built as planned:

- **Safe structural edits.** Pure functions in `src/yaml/structure.ts` return minimal text edits and never re-serialize. They find nodes with a line-based walk rather than AST positions (the AST only checks results), which handles comments and half-typed lines better.
- **Right-click menu**, **shape conversions**, **sort keys**, **Tab moves the whole subtree**, **move node up/down** (`Alt+↑`/`Alt+↓`).

Added along the way:

- **Logical outdent.** Shift+Tab on a node with later siblings moves it after its parent's block instead of capturing the siblings as children; outdents that wouldn't parse are refused.
- **Rendered view.** A header toggle in standalone `.yaml` files switches to a read-only report laid out from the data's shape, in theme colours, with clickable vault paths. An optional `_view:` block steers it; files with one open rendered. See RENDER.md.
- **Render to HTML file** writes a static, paste-safe page for Word or Google Docs; `npm run render` does the same from the terminal, with `--docx`.

Before release: bump the version, update `versions.json`, and add the rendered view to SPEC.md, which describes only the editor.

## 1.2: Navigation that holds up

- **Folds that stay put.** The unmerged `feat-folding-persistence` branch has sound plumbing (per-file storage, following renames and deletes, saving on file switch) but broken identity: it computes each fold's path from the start of the line, where the path lookup sees only the top level, so `a.b` is saved as `b`, two `sub:` blocks under different list items get the same name, and list items get no name at all. Rebuild on `main` instead of merging: compute the path from the structure model in `src/yaml/structure.ts` (parents give `tasks[1].sub`), add a fingerprint (the key, and for list items a short hash of identifying values) to find a node whose list position changed, and drop a fold rather than guess. Identity lives in pure, tested functions. Nothing is written into the user's YAML.
- **Full multi-document support.** Breadcrumbs, go-to-key, folding and the rendered view work per document, and the breadcrumb shows which document the cursor is in.
- **Outline view.** A sidebar showing the open file's structure, like Obsidian's Outline does for headings: collapsible keys and list items, click to jump, current position highlighted. It can read the same structure model as structural editing and fold identity, exposed through a small public API other plugins can use.
- **Large files stay responsive.** The editor reparses the whole file on every change, and the rendered view re-renders on change. In a test outside Obsidian, parsing a 40,000-line file took about 0.9 seconds. Measure inside Obsidian, then debounce above a size threshold and keep per-keystroke work on the cheap line-based scan.

## 1.3: Schemas

- **Export inferred schema.** A command that writes what the plugin has learned across the vault as a draft JSON Schema file in the schema directory: the quickest way from inconsistent frontmatter to an explicit schema.
- **Quiet schema checks.** For notes opted into an explicit schema, flag a wrong type, a value outside an `enum`, or a missing `required` key, with a subtle underline and the reason on hover, and a setting to turn it off. SPEC.md describes this as "Today: gutter mark + hover," but nothing checks schemas yet, so that line should change either way. Full JSON Schema validation stays out of scope.
- **A palette that learns from use.** Rank keys you actually pick above keys you keep skipping, per vault.

## Later

- **Rendered view beyond standalone files.** Frontmatter and ` ```yaml ` blocks in notes, if there's a use for it; Markdown's own reading view may be enough there.
- **Flow-style paths.** Path detection doesn't handle `{...}` and `[...]` (noted in CLAUDE.md), so breadcrumbs and completions go wrong inside them.
- **Mobile pass.** Nothing has been checked on phones beyond the breadcrumb, which mobile can't show.
