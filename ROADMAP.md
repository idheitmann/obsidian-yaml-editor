# Roadmap

**Status:** proposed by Claude on 2026-11-02, for Ivan to accept, change or
close. Nothing here is committed to until it's merged.

YAML Editor stays a focused, round-trip-safe YAML editor. This roadmap also
prepares it to host the "knowledge garden" loop worked out in
[semantic-pruning-tag](https://github.com/idheitmann/semantic-pruning-tag):
an AI that proposes structural changes to any YAML document, and a person who
reviews them. The garden's build proposal puts its first two phases here,
in this plugin, instead of in a new app.

## Rules for every step

1. **Each step pays off on its own.** Every item helps today's users even if
   the garden never ships. The editor is never held hostage to the bigger idea.
2. **The AI only proposes.** Nothing an agent suggests is applied without a
   person choosing to apply it. No edits on save, no silent rewrites.
3. **Garden state lives in vault files.** Proposals, decisions and schemas are
   plain YAML files in the vault, so they can be read, diffed and versioned
   like everything else. Plugin data (`data.json`) is hidden and stays for UI
   state only, like folds and settings.
4. **Models and file formats now, views later.** How the garden should look
   (text editor, outliner, graph browser, or something between) is deliberately
   undecided. Build the pieces every interface would need, and keep views
   separate from them.

## At a glance

| version | theme | contents |
|---|---|---|
| 1.0.5 | Repair | quoting fix, installable dependencies, CI, accurate agent docs, store listing |
| 1.1 | Foundations | node addresses, range-preserving edits, schema export, document model |
| 1.2 | Proposals (experimental, off by default) | proposal files, review queue, decision log |
| 1.3 | AI, on request | "Propose changes" command with the user's own key |
| later | Kept open | spans, graphical views, git, background proposals |

## 1.0.5: Repair

Small fixes that the rest of the roadmap leans on.

- **Fix the quoting regression.** The 1.0.1 cleanup of regex escapes removed
  `[` from `LEADING_INDICATOR` in `src/yaml/quote.ts` entirely, so a value
  starting with `[` is no longer quoted. It has shipped in 1.0.1 through 1.0.4.
  `tests/quote.test.ts` already catches it; it's the only failing test of 104.
  Agent-applied edits will depend on quoting being right.
- **Make a fresh install work.** `"obsidian": "latest"` has drifted into a peer
  conflict with the CodeMirror packages, so `npm ci` fails on a fresh clone.
  Pin `obsidian` to a tested version.
- **Run tests and typecheck in CI** on every push and pull request. CI would
  have caught the quoting regression before it shipped.
- **Correct CLAUDE.md.** It says there's no test runner and no `versions.json`;
  both exist now. Coding agents read that file first, and this roadmap assumes
  agents will do much of the work, so stale guidance there is expensive.
- **Release the unreleased hanging indent**, and finish the community-directory
  listing before any feature that uses the network. A focused, offline editor is
  the easiest version to get through review.

## 1.1: Foundations

Four pieces that every garden interface would need. Each is useful now.

### Node addresses

One way to identify a node in a YAML document that survives edits. Today
there are two partial answers: `pathKey` names a schema slot
(`tasks[].title`), and the unmerged `feat-folding-persistence` branch adds
`pathInstanceKey` (`tasks[2].title`). Index paths break when a list is
reordered or an item is inserted above: a fold saved on `tasks[2]` reopens on
whatever item is now third.

- An address is a path plus a small fingerprint of the node: its key, and for
  list items a short hash of the item's identifying values.
- Resolving an address tries the path, then searches siblings by fingerprint,
  and reports "not found" rather than guessing.
- **Rework the folding branch onto addresses before merging it.** Folds become
  the first consumer, and the fix for wrong-item folds comes with it.
- Later consumers: proposal targets, span anchors, decision logs.

Nothing is ever written into the user's YAML to make addresses work. No
injected IDs.

### Range-preserving edits

A pure function, `applyEdits(text, ops) → text`, that changes only the text a
change targets: set a value, add or rename a key, insert or remove a list item,
move a node. It uses source ranges from the `yaml` AST and splices text, rather
than re-serializing the document.

- Tested by the rule the SPEC already states: everything outside the changed
  ranges is byte-identical afterward, comments and blank lines included.
- Works on text, not on an open CodeMirror view, so it can apply a change to a
  file that isn't open. The existing commands can move onto it over time.

### Schema export

A command, "Export inferred schema," that writes what `SchemaTracker` has
learned as a draft JSON Schema file in the schema directory.

- Useful now: it's the quickest way to go from a messy vault to an explicit
  schema the plugin already knows how to use.
- For the garden: the schema becomes a file, so later changes to it are diffs
  a person can review. This is the first concrete step toward a schema that
  learns from corrections.

### Document model

A pure, CodeMirror-free representation of a parsed document: each node's
address, path, kind, value, source range, and schema type where known.

- Exposed on the plugin instance so other plugins and future views can read it.
- This is the seam that keeps the interface question open. An outliner, a
  neighborhood graph or a canvas would each be a view over this model, not a
  fork of the editor.

## 1.2: Proposals (experimental, off by default)

The garden's review loop, with no AI inside the plugin yet. Behind an
"Experimental: proposals" setting that's off by default.

### Proposal files

A proposal is a YAML file in a vault folder (default `_proposals/`): who made
it, why, which file it targets, and a list of operations using node addresses.
It mirrors the plan files in semantic-pruning-tag.

```yaml
proposal: 2026-11-14-tasks-merge
by: claude
reason: Two tasks describe the same work.
target: projects/garden.yaml
ops:
  - op: remove
    at: {path: "tasks[3]", key: title, hash: 9c1f}
  - op: set
    at: {path: "tasks[1].notes", key: notes}
    value: Covers what tasks[3] described.
```

**The format is the contract.** Any agent that can write a file can make
proposals: Claude Code working in the vault, Zed's agent, a script. The plugin
doesn't need to call an AI for the loop to be tested.

### Review queue

A separate view (not part of the editor) that lists open proposals.

- Each shows a diff preview, computed by `applyEdits` without saving.
- Actions: **Accept** (apply it), **Refine** (open it to edit first), **Reject**,
  and **Let fade** (hide it from the queue; it stays on disk and can return).
- If a target address no longer resolves, the proposal says so and can't be
  applied until it's fixed.

### Decision log

Every review decision is appended to a YAML log in the vault: proposal, outcome,
time. This is the data the SPEC's open question about learning from acceptance
and rejection needs. Nothing learns from it yet.

**Gate before 1.3:** Ivan uses proposals on real files for a month, with agents
writing them from outside the plugin. If most proposals get reviewed within a
week, keep going. If they pile up, rethink the loop before adding AI.

## 1.3: AI, on request

- A "Propose changes for this file" command sends the file, its schema and
  recent decisions to a model and writes the result as proposal files.
- Manual trigger only. Opt-in. The user supplies their own API key.
- The README discloses which service is called and why, as Obsidian's developer
  policies require for network use.
- Proposals go to the review queue like any other. The AI never edits directly.

## Later: kept open on purpose

These are possibilities, not plans. The foundations above are designed so each
stays open without being built.

- **Typed spans in strings,** written `[text]{.risk ref=r-schema-churn}` inside
  YAML string values, first shown as a quiet decoration, later linked to nodes.
- **Graphical views** over the document model: an outliner with metadata
  decoration, a neighborhood map, something between an IDE and a graph browser.
- **Background proposals:** compute proposals after edits settle and add them to
  the queue, batched, never shown inline while typing.
- **Git integration.** Proposals and decisions are files, so whatever versions
  the vault versions them. The Obsidian Git community plugin already covers
  commits. Nothing to build until that falls short.
- **Fast inline suggestions** like Mercury's edit prediction. Editors like Zed
  already do this well; it's not this plugin's job.
- **Splitting the garden into a companion plugin,** if it grows large enough
  that the editor's users or the directory reviewers would rather it stood alone.

## Things to avoid

- Running the AI on save, or showing suggestions inline while typing.
- Keeping proposals, decisions or schemas in `data.json`.
- Building the review queue inside the CodeMirror editor.
- Writing IDs or metadata into a user's YAML to make garden features work.
