import {
  autocompletion,
  snippetCompletion,
  CompletionContext,
  CompletionResult,
  Completion,
} from "@codemirror/autocomplete";
import type { CompletionSource } from "@codemirror/autocomplete";
import { probeAt } from "../yaml/path";
import { pathKey } from "../yaml/parser";
import { yamlRegions } from "./mode";
import { resolveSchemaName, propertiesAt, enumAt } from "../yaml/jsonschema";
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

    const lineStart = regionText.lastIndexOf("\n", localOffset - 1) + 1;
    const lineBefore = regionText.slice(lineStart, localOffset);

    const editingValue = probe.position === "value" || (probe.inSequence && probe.position === "empty");

    // Compute the token-start offset (`from`) and gate auto-trigger appropriately.
    let from: number;
    if (editingValue) {
      if (probe.inSequence) {
        // Sequence item value: token starts after '- '.
        const dashIdx = lineBefore.lastIndexOf("- ");
        from = region.from + (dashIdx !== -1 ? lineStart + dashIdx + 2 : localOffset);
      } else {
        // Scalar value: only auto-trigger after 'key: ' (colon + space).
        const colonSpaceIdx = lineBefore.indexOf(": ");
        if (colonSpaceIdx !== -1) {
          from = region.from + lineStart + colonSpaceIdx + 2;
        } else if (ctx.explicit) {
          from = offset; // Ctrl+Space at bare ':' — show at cursor
        } else {
          return null; // bare ':' with no space — wait for the space
        }
      }
    } else {
      // Key or empty line: token starts after leading indent (and optional '- ').
      const prefixMatch = lineBefore.match(/^(\s*(?:-\s+)?)/);
      from = region.from + lineStart + (prefixMatch ? prefixMatch[1].length : 0);
    }

    const results: Completion[] = [];
    const now = new Date();
    const schemaKeys = new Set<string>();

    const isPresent = (keyPart: string): boolean =>
      regionText
        .split("\n")
        .some((l) => l.trimStart().startsWith(`${keyPart}:`) || l.trimStart().startsWith(`- ${keyPart}:`));

    // ── 0. Explicit schema (if the region opts into one) ─────────────────
    const schemaName = resolveSchemaName(regionText);
    const schema = schemaName ? plugin.schemaStore.get(schemaName) : undefined;
    if (schema) {
      // Keys declared at this path — only when not filling in a value.
      if (!editingValue) {
        for (const prop of propertiesAt(schema, probe.path)) {
          schemaKeys.add(prop.key);
          if (isPresent(prop.key) && probe.path.length > 0) continue;
          const detail = [prop.type, prop.required ? "required" : null].filter(Boolean).join(" · ");
          results.push({
            label: prop.key,
            detail: detail || "key",
            info: prop.description ?? (prop.enum ? `one of: ${prop.enum.join(", ")}` : undefined),
            boost: 2,
            apply: (view2, _c, from, to) => {
              view2.dispatch({
                changes: { from, to, insert: `${prop.key}: ` },
                selection: { anchor: from + prop.key.length + 2 },
              });
            },
          });
        }
      }
      // Enum values for the scalar being edited.
      if (probe.position === "value") {
        const key = currentLineKey(regionText, localOffset);
        const values = key ? enumAt(schema, [...probe.path, key]) : null;
        for (const v of values ?? []) {
          results.push({ label: v, detail: "allowed value", type: "enum", boost: 2 });
        }
      }
    }

    // ── 1. Inferred keys observed at this path elsewhere in the vault ────
    if (!editingValue) {
      const stats = plugin.schemaTracker.keysAt(probe.path);
      for (const stat of stats) {
        const keyPart = stat.path.split(".").pop()!.replace(/\[\]$/, "");
        if (!keyPart || schemaKeys.has(keyPart)) continue;

        // Only suggest keys not yet present at this path (heuristic).
        const alreadyPresent = isPresent(keyPart);
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
    }

    // ── 2. Example values for the key being edited ────────────────────────
    if (probe.position === "value") {
      // Cursor is after a key's colon: `related: |`
      const key = currentLineKey(regionText, localOffset);
      if (key) {
        const stat = plugin.schemaTracker.get(pathKey([...probe.path, key]));
        if (stat && stat.examples.length > 0) {
          for (const ex of stat.examples.slice(0, 6)) {
            results.push({ label: ex, detail: `value for ${key}`, type: "text" });
          }
        }
      }
    } else if (probe.inSequence) {
      // Cursor is on a sequence item line: `  - |` inside a list
      const parentStatKey = pathKey(probe.path);
      if (parentStatKey) {
        const stat = plugin.schemaTracker.get(`${parentStatKey}[]`);
        if (stat && stat.examples.length > 0) {
          const leafKey = probe.path[probe.path.length - 1];
          const displayKey = typeof leafKey === "string" ? leafKey : parentStatKey;
          for (const ex of stat.examples.slice(0, 6)) {
            results.push({ label: ex, detail: `value for ${displayKey}`, type: "text" });
          }
        }
      }
    }

    // ── 3. Built-in snippet triggers ─────────────────────────────────────
    // Blank lines trigger top-level field snippets — not when filling in a value.
    if (!editingValue && lineBefore.trim() === "") {
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
      from,
      options: results,
      validFor: /^[^\n]*$/,
    } satisfies CompletionResult;
  };

  return autocompletion({ override: [source] });
}

/** The key name on the line containing `offset` in `text`, or null. */
function currentLineKey(text: string, offset: number): string | null {
  const start = text.lastIndexOf("\n", offset - 1) + 1;
  const end = text.indexOf("\n", offset);
  const line = text.slice(start, end === -1 ? text.length : end);
  const m = /^\s*(?:- )?([^:#\s][^:#]*?)\s*:/.exec(line);
  return m ? m[1].trim() : null;
}
