import { Menu } from "obsidian";
import { EditorView } from "@codemirror/view";
import {
  cmStructural,
  structuralApplies,
  cmToggleQuote,
  cmAddAnchor,
  cmReferenceAnchor,
  type StructuralOp,
} from "../editor/commands";
import { findValueSpan } from "../yaml/quote";
import { insertKeyPoint, listToMap, mapToListOfMaps, scalarToList, sortKeys } from "../yaml/structure";
import { SchemaPaletteModal } from "./palette";
import type YamlEditorPlugin from "../main";

const insertSibling: StructuralOp = (t, o) => insertKeyPoint(t, o, "sibling");
const insertChild: StructuralOp = (t, o) => insertKeyPoint(t, o, "child");

/**
 * Add the YAML entries to a right-click menu for the cursor's position (SPEC
 * §4). Only entries that apply there are shown: no "Convert list to map" on a
 * scalar, no "Toggle quotes" on a line without a value.
 */
export function addYamlMenuItems(menu: Menu, view: EditorView, plugin: YamlEditorPlugin): void {
  const item = (title: string, icon: string, run: () => void) =>
    menu.addItem((i) => i.setTitle(title).setIcon(icon).onClick(run));
  const structural = (title: string, icon: string, op: StructuralOp) => {
    if (structuralApplies(view, op)) item(title, icon, () => cmStructural(view, op));
  };
  const insertThenPalette = (op: StructuralOp) => () => {
    cmStructural(view, op);
    new SchemaPaletteModal(plugin.app, view, plugin.schemaTracker, plugin).open();
  };

  menu.addSeparator();
  if (structuralApplies(view, insertSibling)) item("Insert sibling key…", "list-plus", insertThenPalette(insertSibling));
  if (structuralApplies(view, insertChild)) item("Insert child key…", "indent", insertThenPalette(insertChild));

  structural("Convert value to list", "list", scalarToList);
  structural("Convert list to map", "braces", listToMap);
  structural("Convert map to list of maps", "list-tree", mapToListOfMaps);
  structural("Sort keys at this level", "arrow-down-a-z", sortKeys);

  const line = view.state.doc.lineAt(view.state.selection.main.head);
  if (findValueSpan(line.text)) {
    item("Quote / unquote value", "quote", () => cmToggleQuote(view));
    item("Extract anchor…", "anchor", () => cmAddAnchor(view, plugin.app));
  }
  item("Link to alias…", "link", () => cmReferenceAnchor(view, plugin.app));
}

/**
 * Right-click handler for the standalone `.yaml` view, which is a bare
 * CodeMirror with no Obsidian editor menu of its own. Moves the cursor to the
 * clicked spot first (unless it's inside the selection), like Obsidian does.
 */
export function yamlContextMenu(plugin: YamlEditorPlugin) {
  return EditorView.domEventHandlers({
    contextmenu(evt, view) {
      const pos = view.posAtCoords({ x: evt.clientX, y: evt.clientY });
      const sel = view.state.selection.main;
      if (pos !== null && (pos < sel.from || pos > sel.to)) view.dispatch({ selection: { anchor: pos } });
      evt.preventDefault();
      const menu = new Menu();
      addYamlMenuItems(menu, view, plugin);
      menu.showAtMouseEvent(evt);
      return true;
    },
  });
}
