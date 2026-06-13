# YAML Editor for Obsidian

A focused YAML editing *mode* for Obsidian — not just syntax highlighting, but a tool that knows it's editing YAML and behaves accordingly. It gives you schema-aware completions, structural indentation, folding, a snippet palette, and a dedicated editor for standalone YAML files, all without reformatting your text.

It works in three places:

1. **Frontmatter** — the `---` block at the top of a note.
2. **YAML code blocks** — fenced blocks tagged ` ```yaml ` or ` ```yml `.
3. **Standalone `.yaml` / `.yml` files** — opened directly in their own editor (Obsidian normally hides these).

> Design intent and the full specification live in [SPEC.md](SPEC.md). The guiding principle is **round-trip preservation**: the plugin never reorders your keys, strips your comments, or reformats your whitespace behind your back.

---

## Features

### Schema-aware completions

As you type a key inside a YAML region, autocomplete suggests:

- **Keys already used elsewhere in your vault at the same path.** The plugin continuously scans every note's frontmatter and code blocks (and every standalone `.yaml`/`.yml` file) and learns which keys tend to appear where. Suggestions are ranked by how often they occur, and annotated with the value types observed (e.g. `string, date`) and example values.
- **Example values** drawn from how the key is used in other notes.
- **Snippets** for common structures (see below).

The suggestion list is *path-aware*: at the top level of your frontmatter you'll see top-level keys; nested under `dataview:` you'll see the keys other notes nest there. Keys already present at the current level are filtered out.

### Snippet palette & snippets

Two ways to insert structured YAML quickly:

- **Inline snippets** appear in the normal autocomplete list. Accepting one inserts a real template with tab stops you can `Tab` through — e.g. `tags:`, `aliases:`, `created: <today>`, a Dataview field stub, or a `list` / `map` / `list of maps` skeleton. Date placeholders (`${TODAY}`, `${NOW}`) are filled in automatically.
- **Schema Palette** — the *YAML: Insert element here…* command opens a searchable palette scoped to the cursor's current path, combining vault-observed keys, built-in Obsidian field snippets (`tags`, `aliases`, `cssclasses`, `publish`, …), Dataview stubs, shape templates, anchors/aliases, and any snippets you've defined in settings.

You can add your own snippets in the plugin's settings tab (id, label, hint, and a body using `${1:placeholder}` tab stops and `${TODAY}`/`${NOW}` dates).

### Structural editing

- **Smart Enter** — pressing Enter inside a YAML region indents the new line to match the structure: it continues a sequence (adds `- `), indents one level after a block-opening `key:`, and otherwise keeps the current indent for a sibling. Outside YAML regions, Enter behaves normally.
- **Smart Tab / Shift-Tab** — adjusts indentation in 2-space steps, but only inside YAML regions. Elsewhere, Tab does what it always does.
- **Folding** — map and sequence blocks are foldable from the editor gutter, based on indentation. Trailing blank lines aren't swallowed into the fold.

### Value quoting

The **YAML: Toggle quotes on value** command quotes or unquotes the value on the current line, choosing minimal correct quoting. It only quotes when leaving the value bare would actually change how YAML parses it (a `: ` that looks like a mapping, a leading indicator character, surrounding whitespace, or a reserved word like `true`/`no`/`null`). Values that are safe bare — including URLs like `http://example.com` — are left alone. Quoting is an explicit command rather than something that fires while you type, so it never surprises you mid-edit.

### Anchors & aliases

- **YAML: Add anchor** (or `Cmd/Ctrl+Shift+A` in the editor) — adds an `&anchor` to the value on the current line.
- **YAML: Reference anchor** (or `Cmd/Ctrl+Shift+R`) — inserts an `*alias` reference.

### Navigation & orientation

- **Breadcrumb** — the status bar shows your exact location in the document tree, e.g. `frontmatter › project › milestones[2] › title`, updating as you move the cursor.
- **YAML: Go to key…** — jump to a key by dotted path (e.g. `dataview.project`). Matching respects nesting, so `a.b` only finds a `b:` that's actually a child of `a:`.
- **Sequence index badges** — list items show a subtle index marker so you can tell where you are in a long sequence.

### Diagnostics

Parse errors are surfaced quietly: an underline on the offending text plus a marker in the lint gutter, with the parser's message on hover. The plugin reports genuine parse errors only — it is not a style linter and won't nag you about formatting.

### Standalone `.yaml` / `.yml` files

Obsidian normally hides non-Markdown files. With this plugin enabled, `.yaml` and `.yml` files appear in the file explorer and open in a dedicated editor that brings along everything above — completions, smart Enter/Tab, folding, diagnostics, the breadcrumb, and anchor shortcuts — plus line numbers and syntax highlighting. The whole file is treated as YAML.

### Insert frontmatter

The **Insert frontmatter** command adds a `---` block to the top of a note that doesn't have one, and drops your cursor inside it.

---

## Commands & keybindings

All commands are in the command palette and can be assigned hotkeys via **Settings → Hotkeys**.

| Command | What it does |
| --- | --- |
| Insert frontmatter | Add a `---` block at the top of the note |
| YAML: Insert element here… | Open the Schema Palette at the cursor's path |
| YAML: Toggle quotes on value | Quote / unquote the current line's value |
| YAML: Toggle list/scalar | Wrap the current value as an inline list (`x` → `[x]`), or strip a trailing empty `[]` |
| YAML: Go to key… | Jump to a key by dotted path |
| YAML: Add anchor | Add an `&anchor` to the current value |
| YAML: Reference anchor | Insert an `*alias` reference |
| YAML: Format YAML region | Normalize indentation to 2-space multiples (no other reformatting) |

The following work as built-in keybindings whenever the cursor is inside a YAML region (including standalone YAML files):

| Key | Action |
| --- | --- |
| `Enter` | Structure-aware newline + indent |
| `Tab` / `Shift+Tab` | Indent / outdent by 2 spaces |
| `Cmd/Ctrl+Shift+D` | Insert today's date (`YYYY-MM-DD`) |
| `Cmd/Ctrl+Shift+A` | Add an anchor on the current value |
| `Cmd/Ctrl+Shift+R` | Insert an alias reference |

> Note: the command-palette commands (Toggle quotes, Go to key, Insert element, …) currently act on the Markdown editor. Inside a standalone `.yaml` file, the built-in keybindings and autocomplete work, but those palette commands don't yet target the file view.

---

## Settings

- **Show gutter icons** — error markers and fold markers in the editor gutter.
- **Show ghost text** — a faint value hint at the end of the cursor's line when it looks like it wants a value.
- **Show path breadcrumbs** — the YAML path in the status bar.
- **Custom snippets** — define your own palette/autocomplete snippets (id, label, hint, body).
- **Schema directory** — a path setting reserved for explicit JSON-Schema files. *Schema support today is fully inferred from your vault; loading explicit schema files from this directory is not implemented yet.*

---

## How the inferred schema works

There is no schema file to maintain. The plugin builds a **probabilistic schema** by watching your vault: for every key path it sees, it records the value types, a few example values, and how often the path occurs. This updates incrementally as you create, edit, rename, and delete files. Completions and the palette are driven by this — so the more consistently you use a field across your notes, the better the suggestions get. Obsidian vaults are messy, so suggestions are ranked by frequency, not enforced as rules.

---

## Installing

This plugin isn't in the community store yet, so install it manually.

**From a release build:** copy `main.js`, `manifest.json`, and `styles.css` into `<your vault>/.obsidian/plugins/yaml-editor/`, then enable **YAML Editor** under Settings → Community plugins.

**For development** (symlink the repo into your vault):

```bash
ln -s /path/to/obsidian-yaml-editor <your vault>/.obsidian/plugins/yaml-editor
```

The symlink (or folder) must be named `yaml-editor` to match the plugin id. Then:

```bash
npm install
npm run dev      # esbuild watch — rebuilds main.js on change
```

Obsidian has no hot reload, so after a rebuild, reload the plugin (toggle it off/on, or run "Reload app without saving"). For a one-off production build, use `npm run build`.

Requires Obsidian **1.5.0+**. Works on desktop and mobile (the status-bar breadcrumb is desktop-only, as Obsidian mobile has no status bar).

---

## What it deliberately doesn't do

- It is **not** a general structured-data editor — YAML only, no JSON/TOML.
- It does **not** reformat on save or enforce a style. Your whitespace, key order, and comments are yours.
- It surfaces parse errors, not lint/style opinions.

See [SPEC.md](SPEC.md) for the complete design rationale and non-goals.

## License

MIT
