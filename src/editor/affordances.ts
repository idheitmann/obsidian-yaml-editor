import {
  Decoration,
  DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import { RangeSetBuilder, StateField } from "@codemirror/state";
import { yamlStateField, yamlViewPlugin } from "./state";
import type YamlEditorPlugin from "../main";

// ── Ghost text widget ───────────────────────────────────────────────────────

class GhostTextWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "yaml-ghost-text";
    span.textContent = this.text;
    span.setAttribute("aria-hidden", "true");
    return span;
  }

  eq(other: GhostTextWidget): boolean {
    return other.text === this.text;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

// ── Affordances StateField ───────────────────────────────────────────────────

function buildAffordances(
  plugin: YamlEditorPlugin,
): StateField<DecorationSet> {
  return StateField.define<DecorationSet>({
    create() {
      return Decoration.none;
    },

    update(decos, tr) {
      decos = decos.map(tr.changes);
      // Ghost text follows the cursor, so we must also recompute when only
      // the selection moves — not just on document edits.
      if (!tr.docChanged && !tr.selection) return decos;

      const extState = tr.state.field(yamlStateField, false);
      if (!extState) return decos;

      const builder = new RangeSetBuilder<Decoration>();
      const { regions, parseErrors } = extState;
      const cursor = tr.state.selection.main.head;
      const showGhost = plugin.settings.showGhostText;

      for (let i = 0; i < regions.length; i++) {
        const region = regions[i]!;

        // Error underline spanning the region's text.
        if (parseErrors.has(i)) {
          builder.add(
            region.from,
            region.to,
            Decoration.mark({ class: "yaml-error-underline" }),
          );
        }

        // Ghost text — only on the cursor's own line, and only when the line
        // is a key awaiting a value. Quiet by default (SPEC design principle 2).
        if (showGhost && cursor >= region.from && cursor <= region.to) {
          const lines = region.text.split("\n");
          let offset = region.from;
          for (const line of lines) {
            const lineEnd = offset + line.length;
            if (cursor >= offset && cursor <= lineEnd) {
              const trimmed = line.trimEnd();
              if (
                trimmed.endsWith(":") &&
                !trimmed.includes("#") &&
                cursor === lineEnd
              ) {
                builder.add(
                  lineEnd,
                  lineEnd,
                  Decoration.widget({
                    widget: new GhostTextWidget(" value"),
                    side: 1,
                  }),
                );
              }
              break;
            }
            offset = lineEnd + 1;
          }
        }
      }

      return builder.finish();
    },

    provide: (field) => EditorView.decorations.from(field),
  });
}

// ── Public extension ─────────────────────────────────────────────────────────

export function yamlAffordances(
  plugin: YamlEditorPlugin,
): import("@codemirror/state").Extension {
  return [
    buildAffordances(plugin),
    yamlViewPlugin,
    EditorView.baseTheme({
      ".yaml-error-underline": {
        textDecoration: "underline wavy var(--background-modifier-error, #e53e3e)",
        textUnderlineOffset: "2px",
      },
      ".yaml-ghost-text": {
        color: "var(--text-muted, #aaa)",
        opacity: "0.5",
        fontStyle: "italic",
        pointerEvents: "none",
        fontFamily: "var(--font-monospace, monospace)",
        fontSize: "inherit",
        whiteSpace: "pre",
      },
    }),
  ];
}
