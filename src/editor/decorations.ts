import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { RangeSetBuilder, StateField } from "@codemirror/state";
import { yamlStateField } from "./state";
import { yamlViewPlugin } from "./state";

/**
 * Subtle visual decorations layer.
 * Features: sequence item index badges.
 */
export function yamlDecorations(): import("@codemirror/state").Extension {
  return [
    yamlDecorationsField,
    yamlViewPlugin,
    EditorView.baseTheme({
      ".yaml-sequence-badge": {
        color: "var(--text-muted, #aaa)",
        fontSize: "0.65em",
        verticalAlign: "super",
        fontFamily: "var(--font-monospace, monospace)",
        cursor: "default",
        paddingLeft: "2px",
      },
      ".yaml-breadcrumb": {
        color: "var(--text-muted, #888)",
        fontFamily: "var(--font-monospace, monospace)",
        fontSize: "0.8em",
      },
    }),
  ];
}

const yamlDecorationsField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },

  update(decos, tr) {
    decos = decos.map(tr.changes);
    if (!tr.docChanged) return decos;

    const extState = tr.state.field(yamlStateField, false);
    if (!extState) return decos;

    const builder = new RangeSetBuilder<Decoration>();
    const { regions } = extState;

    // ── Sequence item index badges ────────────────────────────────────────
    for (const region of regions) {
      const lines = region.text.split("\n");
      let offset = region.from;
      for (const line of lines) {
        const trimmed = line.trimStart();
        if (trimmed.startsWith("- ")) {
          const thisIndent = leadingSpaces(line);
          const idx = countSiblings(lines, offset - region.from, thisIndent);
          if (idx > 0) {
            const dashEnd = offset + line.indexOf("- ") + 2;
            const dec = Decoration.mark({
              class: "yaml-sequence-badge",
              attributes: { title: `item ${idx}` },
            });
            builder.add(dashEnd, dashEnd, dec);
          }
        }
        offset += line.length + 1;
      }
    }

    return builder.finish();
  },

  provide: (field) => EditorView.decorations.from(field),
});

function countSiblings(lines: string[], offset: number, targetIndent: number): number {
  let idx = 0;
  let pos = 0;
  for (const line of lines) {
    if (pos >= offset) break;
    const trimmed = line.trimStart();
    if (trimmed.startsWith("- ") && leadingSpaces(line) === targetIndent) idx++;
    pos += line.length + 1;
  }
  return idx;
}

function leadingSpaces(line: string): number {
  let i = 0;
  while (i < line.length && line.charCodeAt(i) === 32) i++;
  return i;
}
