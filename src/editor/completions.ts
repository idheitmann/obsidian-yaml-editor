import {
  autocompletion,
  snippetCompletion,
  CompletionContext,
  CompletionResult,
  Completion,
} from "@codemirror/autocomplete";
import type { CompletionSource } from "@codemirror/autocomplete";
import { probeAt } from "../yaml/path";
import { yamlRegions } from "./mode";
import type { SchemaTracker } from "../yaml/schema";
import type { SnippetTemplate } from "../types";
import { BUILTIN_SNIPPETS, expandDatePlaceholders, toCodeMirrorSnippet } from "../yaml/snippets";
import YamlEditorPlugin from "../main";

/**
 * Build the autocompletion extension.
 *
 * Shows:
 *   - Keys from the vault schema at the current cursor path
 *   - Example values for observed keys
 *   - Built-in + user snippet triggers (`: ` context)
 */
export function yamlCompletion(plugin: YamlEditorPlugin) {
  const source: CompletionSource = (ctx: CompletionContext) => {
    const offset = ctx.pos;

    // Find the YAML region containing the cursor.
    const regions = yamlRegions(ctx.state);
    let region = null;
    let regionText = "";
    let localOffset = offset;
    for (const r of regions) {
      if (offset >= r.from && offset <= r.to) {
        region = r;
        regionText = r.text;
        localOffset = offset - r.from;
        break;
      }
    }

    if (!region) return null;

    // Current path at cursor.
    const probe = probeAt(regionText, localOffset);
    if (!probe) return null;

    const results: Completion[] = [];
    const now = new Date();

    // ── 1. Schema keys at this path ──────────────────────────────────────
    const stats = plugin.schemaTracker.keysAt(probe.path);
    for (const stat of stats) {
      const keyPart = stat.path.split(".").pop()!.replace(/\[\]$/, "");
      if (!keyPart) continue;

      // Only suggest keys not yet present at this path (heuristic).
      const alreadyPresent = regionText
        .split("\n")
        .some((l) => l.trimStart().startsWith(`${keyPart}:`) || l.trimStart().startsWith(`- ${keyPart}:`));
      if (alreadyPresent && probe.path.length > 0) continue;

      results.push({
        label: keyPart,
        detail: stat.kinds
          ? Object.entries(stat.kinds)
              .filter(([, v]) => v > 0)
              .map(([k]) => k)
              .join(", ")
          : "key",
        info: stat.examples.length > 0 ? `e.g. ${stat.examples.slice(0, 3).join(", ")}` : undefined,
        apply: (view2, _completion, from, to) => {
          view2.dispatch({
            changes: { from, to, insert: `${keyPart}: ` },
            selection: { anchor: from + keyPart.length + 2 },
          });
        },
      });
    }

    // ── 2. Example values for scalar keys ─────────────────────────────────
    const firstStat = plugin.schemaTracker.keysAt(probe.path)[0];
    const fullStat = plugin.schemaTracker.get(firstStat?.path ?? "");
    if (fullStat && fullStat.examples.length > 0) {
      const keyPart = fullStat.path.split(".").pop()!.replace(/\[\]$/, "");
      for (const ex of fullStat.examples.slice(0, 6)) {
        results.push({
          label: ex,
          detail: `value for ${keyPart}`,
          type: "text",
        });
      }
    }

    // ── 3. Built-in snippet triggers ─────────────────────────────────────
    // `: ` context triggers top-level field snippets.
    const lineStart = regionText.lastIndexOf("\n", localOffset - 1) + 1;
    const lineBefore = regionText.slice(lineStart, localOffset);
    const colonSpace = lineBefore.endsWith(": ") || lineBefore.endsWith(":");

    if (colonSpace || lineBefore.trim() === "") {
      const allSnippets = [...BUILTIN_SNIPPETS, ...(plugin.settings?.customSnippets ?? [])];

      for (const snip of allSnippets) {
        const template = toCodeMirrorSnippet(expandDatePlaceholders(snip.body, now));
        results.push(
          snippetCompletion(template, {
            label: snip.label,
            detail: snip.hint ?? "",
            info: snip.tags.join(", "),
            type: "snippet",
          }),
        );
      }
    }

    return {
      from: offset,
      options: results,
      validFor: /^[^\n]*$/,
    } satisfies CompletionResult;
  };

  return autocompletion({ override: [source] });
}
