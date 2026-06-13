import { EditorState, Facet } from "@codemirror/state";
import { findYamlRegions } from "../yaml/regions";
import type { YamlRegion } from "../types";

/**
 * When true for an editor, the *entire* document is treated as one YAML region
 * rather than scanning for `---` frontmatter / ```yaml fences. This is how the
 * standalone `.yaml`/`.yml` file view ([ui/yamlview.ts]) reuses all the
 * region-based behavior (completions, indent, folding, breadcrumb) that was
 * built for YAML-inside-Markdown.
 */
export const wholeDocYaml = Facet.define<boolean, boolean>({
  combine: (values) => values.some(Boolean),
});

/**
 * Resolve the YAML regions for an editor state, honoring {@link wholeDocYaml}.
 * Prefer this over calling `findYamlRegions` directly so both the Markdown and
 * the standalone-file editors share one code path.
 */
export function yamlRegions(state: EditorState): YamlRegion[] {
  if (state.facet(wholeDocYaml)) {
    const text = state.doc.toString();
    return [{ kind: "codeblock", from: 0, to: text.length, text, info: "yaml" }];
  }
  return findYamlRegions(state.doc.toString());
}
