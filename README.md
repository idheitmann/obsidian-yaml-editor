# YAML Editor for Obsidian

Edit YAML in Obsidian with an editor that understands its structure: completions learned from your vault, structure-aware indenting and restructuring, folding, and a rendered view that turns a YAML file into a readable report. It never reformats your text: key order, comments and whitespace stay as you wrote them.

It works in note frontmatter, ` ```yaml ` code blocks, and standalone `.yaml` / `.yml` files, which Obsidian normally hides and this plugin opens in their own editor.

## Features

**Completions.** As you type a key, the plugin suggests keys used at the same path elsewhere in your vault, ranked by how often they appear, with example values. Optional [JSON Schemas](#json-schemas) add authoritative keys, descriptions and allowed values.

**Snippets and the palette.** Common fields (`tags`, `aliases`, dates, Dataview stubs, list and map skeletons) appear in autocomplete with tab stops. *YAML: Insert element here…* opens a searchable palette for the cursor's position. You can add your own snippets in settings.

**Structural editing.** Enter continues lists and indents after a `key:`. Tab and Shift+Tab move a key or list item together with everything under it; Shift+Tab places the node after its parent, so the siblings below it stay put. Alt+↑ / Alt+↓ swap a node with its neighbour, comments included. You can also sort keys at a level, convert a value to a list, a list to a map, or a map to a list of maps. These are in the command palette and the right-click menu. Edits that shouldn't change your data are checked, and refused if they would.

**Rendered view.** In a standalone `.yaml` file, the book icon in the header switches to a read-only report: headings, tables and paragraphs laid out from the shape of the data, in your theme's colours, with vault paths you can click. The pencil switches back. An optional `_view:` block in the file controls the title, section order, labels and summary tables; files with one open rendered by default. *YAML: Render to HTML file* saves a static copy next to the YAML that pastes cleanly into Word or Google Docs. See [RENDER.md](RENDER.md) for the `_view` options.

**Orientation.** Folding, a status-bar breadcrumb (`project › milestones[2] › title`), index markers on list items, *Go to key…* by dotted path, and quiet parse-error markers. It reports parse errors only and isn't a style linter.

**Smaller tools.** Toggle minimal quoting on a value, add and reference anchors, insert today's date, and insert a frontmatter block.

## Keys

Inside YAML:

| Key | Action |
| --- | --- |
| `Enter` | New line at the right indent |
| `Tab` / `Shift+Tab` | Indent / outdent the node and its children |
| `Alt+↑` / `Alt+↓` | Move the node up / down |
| `Cmd/Ctrl+Shift+D` | Insert today's date |
| `Cmd/Ctrl+Shift+A` | Add an anchor |
| `Cmd/Ctrl+Shift+R` | Reference an anchor |

Every command is in the palette under "YAML:" and can be given a hotkey in Settings → Hotkeys.

## JSON Schemas

The plugin works without any setup, learning from your vault. For fields you want to standardize, put a JSON Schema file in the schema folder (default `yaml-schemas/` inside your vault's `.obsidian` folder; configurable in settings) and opt in with a top-level `_schema: book` key, or `# yaml-schema: book` in a code block. `book` is the file name or the schema's `$id`.

```json
{
  "type": "object",
  "properties": {
    "title": { "type": "string", "description": "Book title" },
    "status": { "enum": ["unread", "reading", "finished"] }
  }
}
```

Schema keys are suggested first, with their descriptions, and `enum` values are offered as completions. Local `$ref`s are followed; remote ones aren't. Run *YAML: Reload schemas* after editing a schema file.

## Settings

Schema folder, open reports in rendered view, gutter icons, ghost-text hints, path breadcrumbs, aligned wrapped lines, and your own snippets.

## Installing

Install **YAML Editor** from Settings → Community plugins. Requires Obsidian 1.5.0 or later; works on desktop and mobile (the breadcrumb is desktop-only).

To build it yourself, see [CLAUDE.md](CLAUDE.md) for the commands and [SPEC.md](SPEC.md) for the design and non-goals.

## Support

If the plugin saves you time, you can [buy me a coffee](https://buymeacoffee.com/ivanheitmann).

[!["Buy Me a Coffee"](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=flat&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/ivanheitmann)

## License

MIT
