# Rendered view

`src/render/` turns any YAML document into a plain HTML report. It knows no schema: layout comes from the shape of the data, plus optional hints the file carries in a top-level `_view:` key. A file without `_view` still renders.

The markup is deliberately simple: headings, paragraphs, bullet lists and tables, styled inline. That is what survives a paste into Word or Google Docs, and it reads fine in a browser or an Obsidian HTML-reader plugin. The exported page has no classes, grid or flex layout, CSS variables, scripts or internal links.

## Three ways in

- **In Obsidian, the rendered view.** Standalone `.yaml` files get a header button (and the command "YAML: Toggle rendered view") that switches between the editor and the rendered report. It uses the `theme` palette: no fixed fonts or colours, Obsidian's theme variables instead, and vault paths as clickable links. It re-renders as the file changes. Files with a top-level `_view:` block open rendered by default (setting "Open reports in rendered view"); a mode picked with the toggle is remembered by the pane.
- **In Obsidian, "YAML: Render to HTML file".** Writes `<file>.html` next to the YAML with the `inline` palette (fixed black-on-white, paste-safe). Use it when you want a static copy to share or paste.
- **The CLI**, `npm run render -- <file.yaml> [-o out.html] [--docx]`, a Node script for the terminal and for agents. Same output as the command. `--docx` also writes a Word file, converted with LibreOffice (which keeps table borders and bold labels), falling back to pandoc. The CLI uses Node APIs (`fs`, `child_process`), so it does not run inside Obsidian, and `.docx` is CLI-only.

All three call the same pure functions in `src/render/render.ts` (`renderYaml`, `renderPage`): text in, escaped HTML string out, with a `palette` option (`inline` or `theme`, defined in `styles.ts`).

## Getting it into a document

- **Paste:** open the `.html` in a browser, select all, paste into Word or a Google Doc.
- **Google Docs without pasting:** upload the `.html` to Drive and choose *Open with → Google Docs*.
- **Word:** open the `.html` in Word, or use `--docx`.

## What it does without hints

| Data shape | Rendered as |
|---|---|
| Map | A two-column label table for runs of short values; a bold label followed by paragraphs, bullets or a nested block for longer ones. Keys are humanized (`changes_needed` → "Changes needed"). |
| Long string (over 100 characters, or multi-line) | Paragraphs on blank lines; a block of `- ` lines as bullets |
| List of scalars | Bullets, or a comma-separated line in a table cell when the items are short |
| List of maps, at most 6 keys, all short scalars | A table with a header row |
| Other list of maps | A heading per record, titled by `name`, `title`, `label`, `id` or `key` |
| Top-level map whose values are all maps | A legend: one heading per entry |
| A value equal to a legend key, or a `snake_case` identifier in text that matches one | The entry's label |
| A vault path (`folder/File.md`, optionally followed by `(note)`) | The filename, with the folder in grey |
| `**bold**`, `*italic*`, `` `code` ``, `[text](url)`, bare URLs, `[[wikilink\|alias]]` | Inline markup; wikilinks become their text |
| Keys starting with `_` | Hidden |
| `#` comment lines at the top of the file | An italic note under the title |

## `_view` hints

All hints are structural. None of them names a domain concept, which is what keeps the renderer independent of any one schema.

```yaml
_view:
  title: Contractor status          # page title (else top-level `title`, else filename)
  intro: overview                   # top-level field set as prose under the title
  facts: meta                       # top-level map shown as a compact facts strip
  order: [people, classes]          # section order; unlisted sections follow in file order
  hide: [scratch]                   # sections to leave out
  comment: false                    # don't show the leading comment
  labels:                           # display labels, by key or dotted path
    class: Classification
  lists:                            # per top-level sequence
    people:
      as: cards                     # cards (a heading per record) | table | list
      title: name                   # field holding each item's title
      headline: [status, class.target]   # one "Label: value" line under the heading (dotted paths)
      narrative: [overview, intent]      # prose blocks before the remaining fields
  matrix:                           # pivot tables (● marks), placed after the intro
    - title: Target classification
      rows: people                  # top-level sequence
      cols: class.target            # item field whose value picks the column
```

Headline values are shown as one bold "Label: value" line under the record's heading. A long value is cut to its first clause there and still shown in full below. Narrative and uncut headline fields are not repeated. Matrix columns that are legend keys use the legend's labels and order.

Unknown or malformed hints are ignored, never fatal.

## Writing files for it

- Put the narrative in the data (`overview:` fields), not in the renderer. The page should never say something the record doesn't.
- Give legend entries a `label:` when the key doesn't humanize well (`kj_redline` → "Kj redline").
- Use `snake_case` keys for anything you want to cross-reference from prose.
