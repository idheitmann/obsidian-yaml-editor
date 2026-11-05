import { describe, it, expect } from "vitest";
import { renderYaml, renderData, renderPage } from "../src/render/render";
import { asPath, renderInline } from "../src/render/inline";
import { readHints } from "../src/render/hints";
import { buildRefs, humanize, leadingComment } from "../src/render/util";

const noRefs = new Map();

describe("escaping", () => {
  it("escapes HTML in keys and values", () => {
    const { html } = renderYaml(`"<b>k</b>": "<script>alert(1)</script>"\n`);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>k</b>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes inside markdown tokens and link targets", () => {
    const out = renderInline('**<i>x</i>** [t](https://a.b/"onmouseover=x)', noRefs);
    expect(out).not.toContain("<i>");
    expect(out).not.toContain('"onmouseover');
  });
});

describe("inline markdown", () => {
  it("renders code, bold, italics, wikilinks and urls", () => {
    const out = renderInline("`a_b` **bold** *it* [[Note|alias]] https://x.org", noRefs);
    expect(out).toContain('<span style="font-family:Consolas,monospace">a_b</span>');
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<em>it</em>");
    expect(out).toContain(" alias ");
    expect(out).toContain('href="https://x.org"');
  });

  it("handles nested emphasis without looping", () => {
    expect(renderInline("**a *b* c** and *d*", noRefs)).toBe("<strong>a <em>b</em> c</strong> and <em>d</em>");
  });

  it("leaves snake_case identifiers alone unless they are refs", () => {
    expect(renderInline("plain some_key here", noRefs)).toBe("plain some_key here");
  });

  it("only italicizes asterisks that aren't inside a word", () => {
    expect(renderInline("2*3*4 and a*b*", noRefs)).toBe("2*3*4 and a*b*");
    expect(renderInline("x*y* *z* (*w*)", noRefs)).toBe("x*y* <em>z</em> (<em>w</em>)");
    expect(renderInline("`c`*i*", noRefs)).toBe('<span style="font-family:Consolas,monospace">c</span><em>i</em>');
  });

  it("replaces a ref key only when it stands alone", () => {
    const refs = new Map([["my_key", { label: "Label" }]]);
    expect(renderInline("my_key, (my_key) xmy_key", refs)).toBe("Label, (Label) xmy_key");
    expect(renderInline("a.my_key dir/my_key -my_key my_key/x", refs)).toBe("a.my_key dir/my_key -my_key my_key/x");
  });
});

describe("asPath", () => {
  it("recognises vault paths with an optional note", () => {
    expect(asPath("projects/X/Plan.md (decision 4)")).toEqual({ path: "projects/X/Plan.md", note: "decision 4" });
    expect(asPath("Contractor SOPs.md")).toEqual({ path: "Contractor SOPs.md", note: undefined });
  });

  it("does not treat prose as a path", () => {
    expect(asPath("We should really update the file called README.md")).toBeNull();
    expect(asPath("just text")).toBeNull();
  });
});

describe("refs", () => {
  const data = {
    classes: { ic_b2b: { label: "B2B contractor", law: "Lab. Code 2776" }, w2: { what: "Employee" } },
    people: [{ name: "A", class: "ic_b2b", detail: { note: "falls back to ic_b2b if needed" } }],
  };

  it("indexes children of a map whose values are all maps", () => {
    const refs = buildRefs(data);
    expect(refs.get("ic_b2b")).toEqual({ label: "B2B contractor", summary: "Lab. Code 2776" });
    expect(refs.get("w2")?.label).toBe("W2");
  });

  it("shows a ref key, as a value or inside text, as the entry's label", () => {
    const { html } = renderData(data);
    expect(html).not.toContain("ic_b2b");
    expect(html).toContain("falls back to B2B contractor if needed");
  });
});

describe("layout", () => {
  it("renders short uniform records as a table with headers", () => {
    const { html } = renderData({ rates: [{ role: "ENG", rate: 200 }, { role: "GIS", rate: 175 }] });
    expect(html).toMatch(/<th style="[^"]*">Role<\/th>/);
    expect(html).toContain(">ENG</td>");
  });

  it("renders other records as a heading each, short fields in a label table", () => {
    const { html } = renderData({ people: [{ name: "Ann", role: "PM", detail: { x: 1 } }] });
    expect(html).toMatch(/<h3[^>]*>Ann<\/h3>/);
    expect(html).toContain("<strong>Role</strong></td>");
  });

  it("renders a map of maps as one heading per entry", () => {
    const { html } = renderData({ kinds: { a: { label: "Alpha", what: "x" }, b: { what: "y" } } });
    expect(html).toMatch(/<h3[^>]*>Alpha<\/h3>/);
    expect(html).toMatch(/<h3[^>]*>B<\/h3>/);
  });

  it("hides keys starting with an underscore", () => {
    const { html } = renderData({ _secret: "nope", shown: "yes" });
    expect(html).not.toContain("nope");
    expect(html).toContain("yes");
  });

  it("humanizes keys", () => {
    expect(humanize("changes_needed")).toBe("Changes needed");
  });

  it("uses only paste-safe markup", () => {
    const { html } = renderPage("a:\n  - {name: x, b: {c: 1}}\nk: {e: {label: E}}\n");
    expect(html).not.toMatch(/class="/);
    expect(html).not.toMatch(/href="#/);
    expect(html).not.toMatch(/display:\s*(grid|flex|contents)/);
    expect(html).not.toMatch(/var\(--/);
    expect(html).not.toContain("<script");
  });

  it("gives tables width attributes for LibreOffice", () => {
    const { html } = renderData({ m: { a: 1, b: 2 } });
    expect(html).toMatch(/<table width="100%"[^>]*><colgroup><col width="28%"/);
  });
});

describe("view hints", () => {
  const yaml = [
    "# A note at the top.",
    "_view:",
    "  title: Report",
    "  intro: overview",
    "  facts: meta",
    "  order: [b, a]",
    "  labels: {status: State}",
    "  lists:",
    "    b: {as: cards, title: who, headline: [status, kind], narrative: [story]}",
    "  matrix: [{rows: b, cols: kind}]",
    "overview: The intro paragraph.",
    "meta: {owner: Ivan}",
    "kinds: {x_kind: {label: Kind X}, y_kind: {label: Kind Y}}",
    "a: first in file",
    "b:",
    "  - who: Ann",
    "    status: ok",
    "    kind: x_kind",
    "    story: Long story.",
    "  - who: Bo",
    "    status: former. Left in March for another job",
    "    kind: y_kind",
    "",
  ].join("\n");

  it("applies title, comment, facts, intro, order, labels, headline, narrative and matrix", () => {
    const { html, title } = renderYaml(yaml);
    expect(title).toBe("Report");
    expect(html).toMatch(/<h1[^>]*>Report<\/h1>/);
    expect(html).toContain("A note at the top.");
    expect(html).toContain("<strong>Owner:</strong> Ivan");
    expect(html).toContain(">The intro paragraph.</p>");
    expect(html.indexOf(">B</h2>")).toBeLessThan(html.indexOf(">A</h2>"));
    expect(html).toContain("<strong>State:</strong> ok");
    expect(html).toContain("<strong>Kind:</strong> Kind X");
    expect(html).toContain("<strong>Story</strong></p>");
    expect(html).toMatch(/<h2[^>]*>B by kind<\/h2>/);
    expect(html).toContain("●");
  });

  it("cuts long headline values and keeps the full value in the body", () => {
    const { html } = renderYaml(yaml);
    expect(html).toContain("<strong>State:</strong> former");
    expect(html).toContain("former. Left in March for another job");
    // a headline shown in full is not repeated in the field table
    expect(html.match(/>ok</g)).toBeNull();
  });

  it("ignores malformed hints", () => {
    expect(readHints({ order: 3, lists: "x", matrix: [{ rows: 1 }] })).toMatchObject({ order: undefined, matrix: [] });
    expect(() => renderData({ _view: "junk", a: 1 })).not.toThrow();
  });
});

describe("documents", () => {
  it("reads the leading comment block", () => {
    expect(leadingComment("# one\n# two\n\nkey: v\n# later")).toBe("one\ntwo");
  });

  it("renders multiple documents and reports parse errors without throwing", () => {
    const r = renderYaml("a: 1\n---\nb: [\n");
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.html).toContain("<hr>");
  });

  it("wraps a full page", () => {
    const { html } = renderPage("a: 1\n", { fallbackTitle: "file" });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>file</title>");
  });
});
