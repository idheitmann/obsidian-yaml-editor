import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { RangeSetBuilder, type Extension } from "@codemirror/state";
import { hangWidth } from "../yaml/hang";
import { yamlRegions } from "./mode";
import type YamlEditorPlugin from "../main";

/**
 * Aligns soft-wrapped YAML lines under the start of their own content.
 *
 * Implemented as a per-line decoration carrying the width as an inline custom
 * property, because the indent differs line by line and CSS can't read a
 * line's leading whitespace. The styling itself (see `.yaml-hang-line` below)
 * shifts the whole line box right by that width and pulls the *first* line
 * back out again with a negative text-indent — so only the wrapped remainder
 * moves, and CodeMirror's own `.cm-line` padding is left untouched.
 *
 * Scoped to YAML regions, so prose in a Markdown note is unaffected. A no-op
 * when line wrapping is off (nothing wraps, nothing to align).
 */
export function yamlHangingIndent(plugin: YamlEditorPlugin): Extension {
  return [
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
          this.decorations = buildHangs(view, plugin.settings.hangingIndent);
        }

        update(update: ViewUpdate) {
          // Viewport-scoped, so a scroll needs a rebuild too. `focusChanged`
          // picks up a settings toggle when the user clicks back into the
          // editor, since the setting is read at build time.
          if (update.docChanged || update.viewportChanged || update.focusChanged) {
            this.decorations = buildHangs(update.view, plugin.settings.hangingIndent);
          }
        }
      },
      { decorations: (v) => v.decorations },
    ),
    EditorView.baseTheme({
      ".yaml-hang-line": {
        marginLeft: "var(--yaml-hang)",
        textIndent: "calc(-1 * var(--yaml-hang))",
      },
    }),
  ];
}

/** Line decorations for the visible YAML lines that need a hanging indent. */
function buildHangs(view: EditorView, enabled: boolean): DecorationSet {
  if (!enabled) return Decoration.none;

  const regions = yamlRegions(view.state);
  if (regions.length === 0) return Decoration.none;

  const builder = new RangeSetBuilder<Decoration>();
  const { doc } = view.state;

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      if (regions.some((r) => line.from >= r.from && line.from < r.to)) {
        const width = hangWidth(line.text);
        if (width > 0) builder.add(line.from, line.from, hangDeco(width));
      }
      pos = line.to + 1;
    }
  }

  return builder.finish();
}

/** Decorations are shared per width so identical lines reuse one object. */
const hangCache = new Map<number, Decoration>();

function hangDeco(width: number): Decoration {
  let deco = hangCache.get(width);
  if (!deco) {
    deco = Decoration.line({
      class: "yaml-hang-line",
      attributes: { style: `--yaml-hang: ${width}ch` },
    });
    hangCache.set(width, deco);
  }
  return deco;
}
