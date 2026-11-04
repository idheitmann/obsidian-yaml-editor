# Rendered view

`src/render/` turns any YAML document into a read-only HTML report. It knows no schema: layout comes from the shape of the data, plus optional hints the file carries in a top-level `_view:` key. A file without `_view` still renders.

The renderer is a pure function (`renderYaml(text, opts)` → `{ html, title, errors }`) with every value escaped, so the same code serves two surfaces:

- **Standalone page:** `npm run render -- <file.yaml> [-o out.html] [--vault <name>]` writes a self-contained HTML file (no scripts, no network). With `--vault`, vault paths and wikilinks become `obsidian://open` links.
- **Obsidian view (not wired yet):** call `renderYaml` from a view on `.yaml` files, pass a `link` resolver that maps vault paths to internal links, and add `RENDER_CSS` (from `styles.ts`). Its tokens fall back to Obsidian's theme variables, so it follows the vault theme.

## What it does without hints

| Data shape | Rendered as |
|---|---|
| Map | Label/value rows; keys humanized (`changes_needed` → "Changes needed") |
| Long string (over 140 characters, or multi-line) | Prose: paragraphs on blank lines, `- ` lines as bullets |
| List of scalars | Bullets |
| List of maps, at most 6 keys, all short scalars | Table |
| Other list of maps | Cards, titled by `name`, `title`, `label`, `id` or `key` |
| Top-level map whose values are all maps | Reference entries (a legend), each with an anchor |
| A value equal to a legend key, or a `snake_case` identifier in text that matches one | Link to that entry, with its summary on hover |
| A vault path (`folder/File.md`, optionally followed by `(note)`) | Filename, with the folder muted |
| `[[wikilink]]`, `**bold**`, `*italic*`, `` `code` ``, `[text](url)`, bare URLs | Inline markup |
| Keys starting with `_` | Hidden |
| `#` comment lines at the top of the file | A note under the title |

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
      as: cards                     # cards | table | list
      title: name                   # field holding each item's title
      headline: [status, class.target]   # badges under the title (dotted paths)
      narrative: [overview, intent]      # prose blocks before the remaining fields
  matrix:                           # pivot tables, placed after the intro
    - title: Target classification
      rows: people                  # top-level sequence
      cols: class.target            # item field whose value picks the column
```

Headline values longer than a short clause are cut in the badge and still shown in full in the card body. Narrative and untruncated headline fields are not repeated in the body. Matrix columns that are legend keys use the legend's labels and order.

Unknown or malformed hints are ignored, never fatal.

## Writing files for it

- Put the narrative in the data (`overview:` fields), not in the renderer. The page should never say something the record doesn't.
- Give legend entries a `label:` when the key doesn't humanize well (`kj_redline` → "Kj redline").
- Use `snake_case` keys for anything you want to cross-reference from prose.

## Word and Google Docs

`npm run render -- <file.yaml> --doc` also writes `<file>.doc.html` in **document mode**: the same content and the same `_view` hints, built only from markup that survives a paste into Word or Google Docs. That means headings, paragraphs, bullet lists, and tables with inline styles. There are no classes, grid or flex layout, CSS variables, scripts or internal links. Cards become headings, badges become a bold "Label: value" line, label/value rows become two-column tables, and cross-references become their plain labels.

Three ways to use it:

- **Paste:** open the `.doc.html` in a browser, select all, and paste into Word or a Google Doc.
- **Google Docs without pasting:** upload the `.doc.html` to Drive and choose *Open with → Google Docs*.
- **Word file:** `--docx` writes `<file>.docx` too. It converts with LibreOffice (`soffice`), which keeps table borders and bold labels, and falls back to pandoc if LibreOffice isn't installed.

From code: `renderDocYaml(text)` and `renderDocPage(text)` in `src/render/doc.ts`.
