// Command-line entry: render a YAML file to HTML.
//
//   npm run render -- <input.yaml> [-o <output.html>] [--vault <name>] [--doc] [--docx]
//
// Default output is the web page, at the input path with .html. With --vault,
// vault paths and wikilinks become obsidian:// links into that vault.
//
// --doc   also writes <name>.doc.html: document mode, built for pasting into
//         Word or Google Docs, opening in Word, or uploading to Google Drive.
// --docx  also writes <name>.docx from the document-mode page. Uses LibreOffice,
//         which keeps table borders and bold labels; falls back to pandoc.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, renameSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { renderDocPage } from "./doc";
import { renderPage } from "./page";

const USAGE = "usage: render-yaml <input.yaml> [-o output.html] [--vault <vault name>] [--doc] [--docx]";

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
  let vault: string | undefined;
  let doc = false;
  let docx = false;
  const inputs: string[] = [];
  while (args.length) {
    const a = args.shift()!;
    if (a === "-o" || a === "--out") out = args.shift();
    else if (a === "--vault") vault = args.shift();
    else if (a === "--doc") doc = true;
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
  const stem = input.replace(/\.ya?ml$/i, "");
  const text = readFileSync(input, "utf8");
  const meta = {
    fallbackTitle: basename(input, extname(input)),
    source: basename(input),
    generated: new Date().toISOString().slice(0, 10),
  };
  const link = vault
    ? (target: string, kind: string) =>
        kind === "url" ? target : `obsidian://open?vault=${encodeURIComponent(vault!)}&file=${encodeURIComponent(target)}`
    : undefined;

  const web = renderPage(text, { link, ...meta });
  const target = out ?? `${stem}.html`;
  writeFileSync(target, web.html);
  for (const e of web.errors) console.error(`warning: ${e}`);
  console.log(target);

  if (doc || docx) {
    const page = renderDocPage(text, meta);
    const docTarget = `${stem}.doc.html`;
    writeFileSync(docTarget, page.html);
    console.log(docTarget);
    if (docx) {
      const docxTarget = `${stem}.docx`;
      if (toDocx(docTarget, docxTarget)) console.log(docxTarget);
      else {
        console.error("error: --docx needs LibreOffice (soffice) or pandoc on PATH. The .doc.html was still written.");
        return 1;
      }
    }
  }
  return 0;
}

process.exit(main(process.argv.slice(2)));
