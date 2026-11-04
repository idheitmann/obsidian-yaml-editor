// The two palettes the renderer writes into inline `style` attributes.
//
// - "inline": fixed fonts and colours (black on white, grey table headers), for
//   the exported page; this is what survives a paste into Word or Google Docs.
// - "theme": no fonts, colours from Obsidian's CSS variables, for the in-app
//   rendered view, so it follows light and dark themes. Same structure.

export type Palette = "inline" | "theme";

export interface Styles {
  table: string;
  cell: string;
  headCell: string;
  labelCell: string;
  p: string;
  labelP: string;
  noteP: string;
  facts: string;
  error: string;
  body: string;
  heading: (level: number) => string;
  /** Inline text: secondary text (folders), code spans, and whether vault paths become links. */
  inline: InlineStyle;
}

export interface InlineStyle {
  muted: string;
  mono: string;
  pathLinks: boolean;
}

const TABLE = "border-collapse:collapse;width:100%;table-layout:fixed;margin:0 0 8pt 0";
const LABEL_P = "margin:8pt 0 2pt 0";

const ARIAL = "font-family:Arial,Helvetica,sans-serif";
const INLINE_CELL = `border:1px solid #bfbfbf;padding:3pt 5pt;vertical-align:top;text-align:left;${ARIAL};font-size:10pt`;

export const INLINE_STYLES: Styles = {
  table: TABLE,
  cell: INLINE_CELL,
  headCell: `${INLINE_CELL};background:#f2f2f2;font-weight:bold`,
  labelCell: `${INLINE_CELL};background:#f7f7f7;font-weight:bold`,
  p: `margin:0 0 6pt 0;${ARIAL};font-size:11pt`,
  labelP: LABEL_P,
  noteP: "margin:0 0 4pt 0;color:#595959;font-style:italic",
  facts: `margin:0 0 6pt 0;${ARIAL};font-size:11pt;color:#404040`,
  error: `margin:0 0 6pt 0;${ARIAL};font-size:11pt;color:#a00000`,
  body: `${ARIAL};font-size:11pt;line-height:1.4;color:#000000;background:#ffffff;max-width:7.5in;margin:24pt auto;padding:0 16px`,
  heading: (lv) => `${ARIAL};font-size:${["20pt", "15pt", "13pt", "11pt"][lv - 1]};font-weight:bold;margin:${lv <= 2 ? "16pt" : "12pt"} 0 4pt 0`,
  inline: { muted: "color:#777777", mono: "font-family:Consolas,monospace", pathLinks: false },
};

const THEME_CELL = "border:1px solid var(--background-modifier-border);padding:0.25em 0.45em;vertical-align:top;text-align:left;font-size:0.92em";

export const THEME_STYLES: Styles = {
  table: TABLE,
  cell: THEME_CELL,
  headCell: `${THEME_CELL};background:var(--background-secondary-alt, var(--background-secondary));font-weight:600`,
  labelCell: `${THEME_CELL};background:var(--background-secondary);font-weight:600`,
  p: "margin:0 0 0.5em 0",
  labelP: LABEL_P,
  noteP: "margin:0 0 0.3em 0;color:var(--text-muted);font-style:italic",
  facts: "margin:0 0 0.5em 0;color:var(--text-muted)",
  error: "margin:0 0 0.5em 0;color:var(--text-error)",
  body: "",
  heading: (lv) => `font-size:${["1.8em", "1.4em", "1.15em", "1em"][lv - 1]};font-weight:600;margin:${lv <= 2 ? "1.2em" : "0.9em"} 0 0.3em 0`,
  inline: { muted: "color:var(--text-faint)", mono: "font-family:var(--font-monospace)", pathLinks: true },
};

export function stylesFor(palette: Palette = "inline"): Styles {
  return palette === "theme" ? THEME_STYLES : INLINE_STYLES;
}
