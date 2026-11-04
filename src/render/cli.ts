// Command-line entry: render a YAML file to a self-contained HTML page.
//
//   npm run render -- <input.yaml> [-o <output.html>] [--docx]
//
// Output defaults to the input path with .html. --docx also writes a .docx
// beside it, converted with LibreOffice (keeps table borders and bold labels),
// falling back to pandoc.
//
// This runs in Node, outside Obsidian. Inside the plugin, call renderPage or
// renderYaml from render.ts directly; they are pure and need no Node APIs.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, renameSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { renderPage } from "./render";

const USAGE = "usage: render-yaml <input.yaml> [-o output.html] [--docx]";

/** Converts the document-mode page to .docx. LibreOffice first, then pandoc. */
function toDocx(html: string, target: string): boolean {
  const dir = mkdtempSync(join(tmpdir(), "render-yaml-"));
  try {
    execFileSync("soffice", [`-env:UserInstallation=file://${join(dir, "profile")}`, "--headless", "--convert-to", "docx:MS Word 2007 XML", "--outdir", dir, html], { stdio: "ignore", timeout: 120000 });
    const made = readdirSync(dir).find((f) => f.endsWith(".docx")); // profile/ sits alongside
    if (made) {
      renameSync(join(dir, made), target);
      return true;
    }
  } catch {
    // fall through to pandoc
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  try {
    execFileSync("pandoc", [html, "-f", "html", "-t", "docx", "-o", target], { stdio: "inherit" });
    return true;
  } catch {
    return false;
  }
}

function main(argv: string[]): number {
  const args = [...argv];
  let out: string | undefined;
  let docx = false;
  const inputs: string[] = [];
  while (args.length) {
    const a = args.shift()!;
    if (a === "-o" || a === "--out") out = args.shift();
    else if (a === "--docx") docx = true;
    else if (a === "-h" || a === "--help") {
      console.log(USAGE);
      return 0;
    } else inputs.push(a);
  }
  if (inputs.length !== 1) {
    console.error(USAGE);
    return 2;
  }
  const input = inputs[0];
  const { html, errors } = renderPage(readFileSync(input, "utf8"), {
    fallbackTitle: basename(input, extname(input)),
    source: basename(input),
    generated: new Date().toISOString().slice(0, 10),
  });
  const target = out ?? `${input.replace(/\.ya?ml$/i, "")}.html`;
  writeFileSync(target, html);
  for (const e of errors) console.error(`warning: ${e}`);
  console.log(target);
  if (docx) {
    const docxTarget = target.replace(/\.html?$/i, "") + ".docx";
    if (!toDocx(target, docxTarget)) {
      console.error("error: --docx needs LibreOffice (soffice) or pandoc on PATH. The .html was still written.");
      return 1;
    }
    console.log(docxTarget);
  }
  return 0;
}

process.exit(main(process.argv.slice(2)));
