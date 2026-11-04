// One stylesheet for both surfaces. Tokens fall back to Obsidian's theme
// variables when present, so the same rules work inside a vault view and on
// the standalone page (which defines its own light/dark values).

export const RENDER_CSS = `
.yr-doc {
  --yr-fg: var(--text-normal, #1d2327);
  --yr-muted: var(--text-muted, #5c6670);
  --yr-faint: var(--text-faint, #8a939b);
  --yr-bg: var(--background-primary, #ffffff);
  --yr-surface: var(--background-secondary, #f5f6f4);
  --yr-border: var(--background-modifier-border, #dfe2dd);
  --yr-accent: var(--text-accent, #2d6a57);
  --yr-badge-bg: var(--background-modifier-hover, #ebefeb);
  color: var(--yr-fg);
  font: 15px/1.55 var(--font-text, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif);
  max-width: 62rem;
  margin: 0 auto;
}
.yr-doc a { color: var(--yr-accent); text-decoration: none; }
.yr-doc a:hover { text-decoration: underline; }
.yr-doc code { font-family: var(--font-monospace, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: .86em; background: var(--yr-badge-bg); padding: .05em .3em; border-radius: 3px; }
.yr-doc p { margin: 0 0 .6em; }
.yr-doc p:last-child { margin-bottom: 0; }
.yr-doc ul { margin: .2em 0; padding-left: 1.2em; }
.yr-doc li { margin: .15em 0; }

.yr-header { margin-bottom: 1.5rem; }
.yr-header h1 { font-size: 1.9rem; line-height: 1.2; margin: 0 0 .6rem; letter-spacing: -.01em; }
.yr-facts { display: flex; flex-wrap: wrap; gap: .3rem 1.4rem; color: var(--yr-muted); font-size: .88rem; margin-bottom: .9rem; }
.yr-fact-label { color: var(--yr-faint); }
.yr-note { color: var(--yr-muted); font-size: .9rem; border-left: 3px solid var(--yr-border); padding: .1rem 0 .1rem .9rem; margin-bottom: 1rem; }
.yr-note p { margin: 0 0 .25em; }
.yr-intro { font-size: 1.05rem; max-width: 46rem; }
.yr-intro p { margin-bottom: .8em; }

.yr-toc { border-top: 1px solid var(--yr-border); border-bottom: 1px solid var(--yr-border); padding: .6rem 0; margin-bottom: 2rem; font-size: .9rem; }
.yr-toc > ul { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: .3rem 1.6rem; }
.yr-toc > ul > li > a { font-weight: 600; }
.yr-toc ul ul { list-style: none; padding: 0; display: inline; }
.yr-toc ul ul li { display: inline; margin: 0 0 0 .7rem; }

.yr-section { margin: 0 0 2.4rem; }
.yr-section > h2 { font-size: 1.3rem; margin: 0 0 .9rem; padding-bottom: .3rem; border-bottom: 1px solid var(--yr-border); }

.yr-cards, .yr-entries { display: grid; gap: 1rem; }
.yr-card, .yr-entry { background: var(--yr-surface); border: 1px solid var(--yr-border); border-radius: 8px; padding: 1rem 1.15rem; scroll-margin-top: 1rem; }
.yr-card-title, .yr-entry-title { margin: 0 0 .5rem; font-size: 1.12rem; line-height: 1.3; }
.yr-entry-title { font-size: 1rem; }
.yr-key { font-weight: 400; color: var(--yr-muted); margin-left: .3rem; }
.yr-entry:target, .yr-card:target { outline: 2px solid var(--yr-accent); }

.yr-badges { display: flex; flex-wrap: wrap; gap: .35rem; margin: 0 0 .8rem; }
.yr-badge { background: var(--yr-badge-bg); border-radius: 999px; padding: .12rem .65rem; font-size: .84rem; }
.yr-badge-label { color: var(--yr-muted); margin-right: .35rem; }

.yr-narrative { margin: 0 0 .8rem; max-width: 46rem; }
.yr-narrative > .yr-label { margin-bottom: .15rem; }

.yr-fields { display: grid; grid-template-columns: minmax(8rem, 12rem) 1fr; gap: .35rem 1rem; }
.yr-field { display: contents; }
.yr-label { color: var(--yr-muted); font-size: .78rem; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; padding-top: .2rem; }
.yr-value { min-width: 0; overflow-wrap: anywhere; }
.yr-field.yr-wide > .yr-label { grid-column: 1 / -1; padding-top: .45rem; }
.yr-field.yr-wide > .yr-value { grid-column: 1 / -1; }
.yr-value > .yr-fields { border-left: 2px solid var(--yr-border); padding-left: .8rem; }
.yr-empty { color: var(--yr-faint); }

.yr-path-base { font-weight: 500; }
.yr-path-dir { color: var(--yr-faint); font-size: .8em; margin-left: .4rem; }
.yr-path-note { color: var(--yr-muted); }
.yr-ref { border-bottom: 1px dotted var(--yr-accent); }
.yr-ref:hover { text-decoration: none; }

.yr-table-wrap { overflow-x: auto; }
.yr-table { border-collapse: collapse; font-size: .9rem; width: 100%; }
.yr-table th, .yr-table td { border-bottom: 1px solid var(--yr-border); padding: .4rem .6rem; text-align: left; vertical-align: top; }
.yr-table thead th { font-size: .8rem; color: var(--yr-muted); font-weight: 600; }
.yr-matrix .yr-cell { text-align: center; }
.yr-matrix thead th:not(:first-child) { text-align: center; }
.yr-dot { color: var(--yr-accent); }
.yr-docsep { border: 0; border-top: 2px dashed var(--yr-border); margin: 3rem 0; }

@media (max-width: 640px) {
  .yr-fields { grid-template-columns: 1fr; gap: .1rem; }
  .yr-field > .yr-label { padding-top: .5rem; }
}
@media print {
  .yr-toc { display: none; }
  .yr-card, .yr-entry { break-inside: avoid; }
  .yr-doc { max-width: none; font-size: 11pt; }
}
`;

/** Extra rules for the standalone page only: page background and dark mode. */
export const PAGE_CSS = `
:root { color-scheme: light dark; }
body { margin: 0; background: #fbfbf9; }
body .yr-doc { padding: 2.2rem 16px 4rem; }
@media (prefers-color-scheme: dark) {
  body { background: #161a1c; }
  .yr-doc {
    --yr-fg: #e3e6e3; --yr-muted: #a3aca6; --yr-faint: #78827c;
    --yr-surface: #1e2427; --yr-border: #323b3f; --yr-accent: #7cc4a8; --yr-badge-bg: #2a3236;
  }
}
@media print { body { background: #fff; } }
`;
