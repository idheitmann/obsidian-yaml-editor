// Command-line entry: render a YAML file to a self-contained HTML page.
//
//   npm run render -- <input.yaml> [-o <output.html>] [--vault <name>]
//
// Output defaults to the input path with .html. With --vault, vault paths and
// wikilinks become obsidian:// links into that vault; without it they render
// as plain text.

import { readFileSync, writeFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { renderPage } from "./page";

function main(argv: string[]): number {
  const args = [...argv];
  let out: string | undefined;
  let vault: string | undefined;
  const inputs: string[] = [];
  while (args.length) {
    const a = args.shift()!;
    if (a === "-o" || a === "--out") out = args.shift();
    else if (a === "--vault") vault = args.shift();
    else if (a === "-h" || a === "--help") {
      console.log("usage: render-yaml <input.yaml> [-o output.html] [--vault <vault name>]");
      return 0;
    } else inputs.push(a);
  }
  if (inputs.length !== 1) {
    console.error("usage: render-yaml <input.yaml> [-o output.html] [--vault <vault name>]");
    return 2;
  }
  const input = inputs[0];
  const text = readFileSync(input, "utf8");
  const link = vault
    ? (target: string, kind: string) =>
        kind === "url" ? target : `obsidian://open?vault=${encodeURIComponent(vault!)}&file=${encodeURIComponent(target)}`
    : undefined;
  const { html, errors } = renderPage(text, {
    link,
    fallbackTitle: basename(input, extname(input)),
    source: basename(input),
    generated: new Date().toISOString().slice(0, 10),
  });
  const target = out ?? input.replace(/\.ya?ml$/i, "") + ".html";
  writeFileSync(target, html);
  for (const e of errors) console.error(`warning: ${e}`);
  console.log(target);
  return 0;
}

process.exit(main(process.argv.slice(2)));
