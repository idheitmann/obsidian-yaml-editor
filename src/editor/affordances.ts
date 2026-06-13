import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
} from "@codemirror/view";
import { RangeSetBuilder, StateField } from "@codemirror/state";
import { yamlEditorState, yamlStateField, yamlViewPlugin } from "./state";

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

const affordancesField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },

  update(decos, tr) {
    decos = decos.map(tr.changes);
    if (!tr.docChanged) return decos;

    const doc = tr.newDoc.toString();
    const extState = tr.state.field(yamlStateField, false);
    if (!extState) return decos;

    const builder = new RangeSetBuilder<Decoration>();
    const { regions, parseErrors } = extState;

    for (let i = 0; i < regions.length; i++) {
      const region = regions[i]!;

      // Error underline on region text.
      if (parseErrors.has(i)) {
        const dec = Decoration.mark({ class: "yaml-error-underline" });
        builder.add(region.from, region.to, dec);
      }

      // Ghost text on lines that look like they want a value.
      const lines = region.text.split("\n");
      let offset = region.from;
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li]!;
        const trimmed = line.trimEnd();
        if (trimmed.endsWith(": ") && !trimmed.includes("[") && !trimmed.includes("#")) {
          const widget = Decoration.widget({ widget: new GhostTextWidget("[ ]"), side: 1 });
          builder.add(offset + line.length, offset + line.length, widget);
        } else if (trimmed.endsWith(": []") || trimmed.endsWith(": {}")) {
          const widget = Decoration.widget({ widget: new GhostTextWidget(""), side: 1 });
          builder.add(offset + line.length, offset + line.length, widget);
        }
        offset += line.length + 1;
      }
    }

    return builder.finish();
  },
});

// ── Public extension ─────────────────────────────────────────────────────────

export function yamlAffordances(): import("@codemirror/state").Extension {
  return [
    affordancesField,
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
