import { describe, it, expect } from "vitest";
import { renderYaml, renderData, buildRefs, humanize, leadingComment } from "../src/render/render";
import { asPath, renderInline } from "../src/render/inline";
import { readHints } from "../src/render/hints";
import { renderPage } from "../src/render/page";

const ctx = { refs: new Map() };

describe("escaping", () => {
  it("escapes HTML in keys and values", () => {
    const { html } = renderYaml(`"<b>k</b>": "<script>alert(1)</script>"\n`);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>k</b>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes inside markdown tokens and link targets", () => {
    const out = renderInline('**<i>x</i>** [t](https://a.b/"onmouseover=x)', ctx);
    expect(out).not.toContain("<i>");
    expect(out).not.toContain('"onmouseover');
  });
});

describe("inline markdown", () => {
  it("renders code, bold, italics, wikilinks and urls", () => {
    const out = renderInline("`a_b` **bold** *it* [[Note|alias]] https://x.org", ctx);
    expect(out).toContain("<code>a_b</code>");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<em>it</em>");
    expect(out).toContain('<span class="yr-wikilink">alias</span>');
    expect(out).toContain('href="https://x.org"');
  });

  it("uses the link resolver for wikilinks", () => {
    const out = renderInline("[[A/B]]", { refs: new Map(), link: (t) => `obsidian://open?file=${t}` });
    expect(out).toContain('href="obsidian://open?file=A/B"');
  });

  it("leaves snake_case identifiers alone unless they are refs", () => {
    expect(renderInline("plain some_key here", ctx)).toBe("plain some_key here");
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
    people: [{ name: "A", class: "ic_b2b" }],
  };

  it("indexes children of a map whose values are all maps", () => {
    const refs = buildRefs(data);
    expect(refs.get("ic_b2b")).toMatchObject({ id: "ref-classes-ic-b2b", label: "B2B contractor", summary: "Lab. Code 2776" });
    expect(refs.get("w2")?.label).toBe("W2");
  });

  it("links a value equal to a ref key, and identifiers inside text", () => {
    const { html } = renderData({ ...data, note: "falls back to ic_b2b if needed" });
    expect(html).toContain('href="#ref-classes-ic-b2b"');
    expect(html.match(/href="#ref-classes-ic-b2b"/g)!.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('id="ref-classes-ic-b2b"');
  });
});

describe("layout heuristics", () => {
  it("renders short uniform records as a table", () => {
    const { html } = renderData({ rates: [{ role: "ENG", rate: 200 }, { role: "GIS", rate: 175 }] });
    expect(html).toContain('<table class="yr-table">');
    expect(html).toContain("<th>Role</th>");
  });

  it("renders records with long or nested values as cards", () => {
    const { html } = renderData({ people: [{ name: "A", detail: { x: 1 } }] });
    expect(html).toContain('class="yr-card"');
    expect(html).toContain("yr-card-title");
  });

  it("hides keys starting with an underscore", () => {
    const { html } = renderData({ _secret: "nope", shown: "yes" });
    expect(html).not.toContain("nope");
    expect(html).toContain("yes");
  });

  it("humanizes keys", () => {
    expect(humanize("changes_needed")).toBe("Changes needed");
  });
});

describe("view hints", () => {
  const yaml = [
    "# A note at the top.",
    "_view:",
    "  title: Report",
    "  intro: overview",
    "  order: [b, a]",
    "  labels: {status: State}",
    "  lists:",
    "    b: {as: cards, title: who, headline: [status], narrative: [story]}",
    "  matrix: [{rows: b, cols: kind}]",
    "overview: The intro paragraph.",
    "a: first in file",
    "b:",
    "  - who: Ann",
    "    status: ok",
    "    kind: x",
    "    story: Long story.",
    "  - who: Bo",
    "    kind: y",
    "",
  ].join("\n");

  it("applies title, intro, order, labels, cards, headline, narrative and matrix", () => {
    const { html, title } = renderYaml(yaml);
    expect(title).toBe("Report");
    expect(html).toContain("<h1>Report</h1>");
    expect(html).toContain("A note at the top.");
    expect(html).toContain('<div class="yr-intro"><p>The intro paragraph.</p></div>');
    expect(html.indexOf('id="s-b"')).toBeLessThan(html.indexOf('id="s-a"'));
    expect(html).toContain('<span class="yr-badge-label">State</span>');
    expect(html).toContain('<div class="yr-narrative">');
    expect(html).toContain('id="b-ann"');
    expect(html).toContain('id="matrix-1"');
    expect(html).toContain('href="#b-ann"');
    // a headline shown in full is not repeated in the field list
    expect(html.match(/>ok</g)!.length).toBe(1);
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
    expect(r.html).toContain("yr-docsep");
  });

  it("wraps a full page with no scripts", () => {
    const { html } = renderPage("a: 1\n", { fallbackTitle: "file" });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>file</title>");
    expect(html).not.toContain("<script");
  });
});
