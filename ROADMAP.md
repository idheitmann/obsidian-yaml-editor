# Roadmap

**Status:** proposed on 2026-11-02. Nothing here is committed to until it's
merged; reorder, cut or add freely.

YAML Editor should be the editor anyone working with YAML in Obsidian reaches
for: structure-aware, fast on real files, and never touching text it wasn't
asked to touch. This roadmap fixes what's broken first, then delivers the
features [SPEC.md](SPEC.md) already promises, then adds a few that make large
and schema-driven files easier to work with.

## How each item is judged

1. **Round-trip preservation.** Every new command changes only the text it
   targets. Tests prove that everything else, comments and blank lines
   included, is byte-identical afterward.
2. **Quiet by default.** New hints and checks earn their pixels or stay off.
3. **Decisions in pure functions.** Logic lives in tested helpers; commands and
   keymaps only apply the result. This is already the convention in CLAUDE.md.
4. **Offline.** The plugin makes no network requests today, which keeps it
   simple to trust and to review. Keep it that way.

## At a glance

| version | theme | highlights |
|---|---|---|
| 1.0.5 | Repair | quoting fix, multi-document files, installable dependencies, CI |
| 1.1 | Structural editing | right-click menu, shape conversions, sort keys, subtree indent |
| 1.2 | Navigation that holds up | folds that stay put, outline view, large-file speed |
| 1.3 | Schemas | export inferred schema, quiet schema checks, smarter palette |
| later | Smaller gaps | flow-style paths, more |

## 1.0.5: Repair

- **Fix the quoting regression.** The 1.0.1 cleanup of regex escapes removed
  `[` from `LEADING_INDICATOR` in `src/yaml/quote.ts`, so "Toggle quotes"
  leaves a value starting with `[` bare, and YAML then reads it as an unclosed
  list. It has shipped in 1.0.1 through 1.0.4. `tests/quote.test.ts` already
  catches it; it's the only failing test of 104.
- **Stop flagging multi-document files as errors.** A standalone file with
  several `---`-separated documents, like most Kubernetes manifests, is valid
  YAML, but the plugin reports "Source contains multiple documents." Parse
  standalone files with `parseAllDocuments` and report only real errors. Fuller
  multi-document support comes in 1.2.
- **Make a fresh install work.** `"obsidian": "latest"` has drifted into a peer
  conflict with the CodeMirror packages, so `npm ci` fails on a fresh clone.
  Pin `obsidian` to a tested version.
- **Run tests and typecheck in CI** on every push and pull request. CI would
  have caught the quoting regression before release.
- **Release the unreleased hanging indent**, and finish the community-directory
  listing so people can install the plugin without copying files by hand.

## 1.1: Structural editing

Most of this is already described in SPEC.md but not built yet.

- **A safe way to make structural edits.** A pure function,
  `applyEdits(text, ops) → text`, that changes only the targeted ranges, using
  source positions from the `yaml` AST instead of re-serializing the document.
  Every command below is built on it, which is how they keep the round-trip
  promise.
- **Right-click menu** in YAML regions (SPEC §4): insert sibling key, insert
  child key, quote or unquote, extract anchor, link to alias.
- **Shape conversions** (SPEC §4): scalar to list, list to map, map to list of
  maps. Today only scalar-to-inline-list exists.
- **Sort keys,** case-insensitive, keeping each key's comments with it (SPEC §4).
- **Tab indents the whole subtree.** SPEC §3 says Tab on a key promotes or
  demotes its whole subtree; today it moves only the current line, which breaks
  structure when a key has children.
- **Move a node up or down** with its subtree (for example `Alt+↑`/`Alt+↓`),
  swapping with its sibling rather than with the neighboring line.

## 1.2: Navigation that holds up

- **Folds that stay put.** The unmerged `feat-folding-persistence` branch saves
  folds by position in a list, like `tasks[2]`. After an item is inserted above
  it or the list is reordered, the fold reopens on the wrong item. Before merging,
  identify a node by its path plus a small fingerprint (its key, and for list
  items a short hash of identifying values), search for it when the path no
  longer matches, and drop the fold rather than guess. Nothing is written into
  the user's YAML to make this work.
- **Full multi-document support.** Breadcrumbs, go-to-key and folding work per
  document, and the breadcrumb shows which document the cursor is in.
- **Outline view.** A sidebar that shows the open file's structure, like
  Obsidian's Outline does for headings: collapsible keys and list items, click
  to jump, and the current position highlighted. It reads from a document model
  kept separate from the editor (each node's path, kind, value and source
  range), which other plugins can also read through a small public API.
- **Large files stay responsive.** The editor reparses the whole file on every
  change. In a test outside Obsidian, parsing a 40,000-line file took about 0.9
  seconds. Measure inside Obsidian, then debounce parsing above a size threshold
  and keep per-keystroke work (path, indent, completions) on the cheap
  line-based scan it already uses.

## 1.3: Schemas

- **Export inferred schema.** A command that writes what the plugin has learned
  across the vault as a draft JSON Schema file in the schema directory. It's
  the quickest way from a vault of inconsistent frontmatter to an explicit
  schema you can tidy up and opt notes into.
- **Quiet schema checks.** For notes opted into an explicit schema, flag a value
  of the wrong type, a value outside an `enum`, or a missing `required` key, with
  a subtle underline and the reason on hover, and a setting to turn it off. This
  answers the SPEC's open question about surfacing violations. The SPEC
  describes this as "Today: gutter mark + hover," but there's no schema checking
  in the code yet, so that line should change either way. Full JSON Schema
  validation stays out of scope.
- **A palette that learns from use.** Rank keys you actually pick above keys you
  keep skipping, per vault. This is the SPEC's other open question.

## Later

- **Flow-style paths.** Path detection doesn't handle `{...}` and `[...]`
  (noted in CLAUDE.md), so breadcrumbs and completions go wrong inside them.
- **Mobile pass.** The plugin isn't desktop-only, but nothing has been checked
  on phones beyond the breadcrumb, which mobile can't show.
