import { App, TFile, debounce } from "obsidian";
import { isMap, isSeq, isScalar } from "yaml";
import type { Pair, YAMLMap, YAMLSeq, Node as YamlNode } from "yaml";

import { findYamlRegions } from "./regions";
import { classifyValue, parseRegion, pathKey } from "./parser";
import type { SchemaKeyStat, YamlPath, YamlValueKind } from "../types";

/** File extensions whose YAML content feeds the inferred schema. */
const SCANNED_EXTENSIONS = new Set(["md", "yaml", "yml"]);

function isStandaloneYaml(extension: string): boolean {
  return extension === "yaml" || extension === "yml";
}

/**
 * Vault-wide schema inference.
 *
 * The tracker walks every markdown file's YAML regions and folds the
 * observed keys, types, and example values into a single map. It updates
 * incrementally on file modify/create/delete, and exposes a
 * `keysAt(path)` query for the autocomplete + palette.
 *
 * This is deliberately probabilistic — Obsidian vaults are messy and
 * partial. We rank suggestions by frequency, not correctness.
 */
/** One observation a file contributes: a path key and the value kind seen there. */
interface Contribution {
  key: string;
  kind: YamlValueKind;
}

export class SchemaTracker {
  private stats = new Map<string, SchemaKeyStat>();
  private perFile = new Map<string, Contribution[]>(); // file -> contributed observations

  constructor(private app: App) {}

  async initialize(): Promise<void> {
    const files = this.app.vault.getFiles().filter((f) => SCANNED_EXTENSIONS.has(f.extension));
    for (const file of files) {
      await this.scan(file);
    }
  }

  attach(): () => void {
    const debounced = debounce(
      (file: TFile) => void this.scan(file),
      500,
      true,
    );
    const scannable = (f: unknown): f is TFile => f instanceof TFile && SCANNED_EXTENSIONS.has(f.extension);
    const onModify = this.app.vault.on("modify", (f) => {
      if (scannable(f)) debounced(f);
    });
    const onCreate = this.app.vault.on("create", (f) => {
      if (scannable(f)) void this.scan(f);
    });
    const onDelete = this.app.vault.on("delete", (f) => {
      if (f instanceof TFile) this.forget(f.path);
    });
    const onRename = this.app.vault.on("rename", (f, oldPath) => {
      this.forget(oldPath);
      if (scannable(f)) void this.scan(f);
    });
    return () => {
      this.app.vault.offref(onModify);
      this.app.vault.offref(onCreate);
      this.app.vault.offref(onDelete);
      this.app.vault.offref(onRename);
    };
  }

  /** Keys observed at the given parent path, sorted by frequency. */
  keysAt(parent: YamlPath): SchemaKeyStat[] {
    const parentKey = pathKey(parent);
    const prefix = parentKey === "" ? "" : `${parentKey}.`;
    const out: SchemaKeyStat[] = [];
    for (const [k, v] of this.stats) {
      if (!k.startsWith(prefix)) continue;
      const tail = k.slice(prefix.length);
      // Direct child: no further `.` and not bare `[]`.
      if (tail.length === 0 || tail.includes(".")) continue;
      if (tail.endsWith("[]") && tail.slice(0, -2).includes("[]")) continue;
      out.push(v);
    }
    out.sort((a, b) => b.count - a.count);
    return out;
  }

  /** Look up stats for a specific full path key, e.g. `tags[]`. */
  get(key: string): SchemaKeyStat | undefined {
    return this.stats.get(key);
  }

  private async scan(file: TFile): Promise<void> {
    const text = await this.app.vault.cachedRead(file);
    this.forget(file.path);

    const contributed: Contribution[] = [];
    // Standalone .yaml/.yml files are YAML in their entirety; Markdown files
    // contribute only their frontmatter and ```yaml fences.
    const regionTexts = isStandaloneYaml(file.extension)
      ? [text]
      : findYamlRegions(text).map((r) => r.text);
    for (const regionText of regionTexts) {
      const parsed = parseRegion(regionText);
      if (parsed.errors.length > 0) continue;
      const root = parsed.doc.contents;
      if (!root) continue;
      walk(root, [], (path, value) => {
        const key = pathKey(path);
        const kind = classifyValue(value);
        contributed.push({ key, kind });
        const example =
          isScalar(value) && typeof value.value === "string"
            ? value.value
            : null;
        this.bump(key, kind, example);
      });
    }
    this.perFile.set(file.path, contributed);
  }

  private bump(key: string, kind: YamlValueKind, example: string | null): void {
    const stat = this.stats.get(key) ?? {
      path: key,
      count: 0,
      kinds: {},
      examples: [],
    };
    stat.count += 1;
    stat.kinds[kind] = (stat.kinds[kind] ?? 0) + 1;
    if (example && stat.examples.length < 12 && !stat.examples.includes(example)) {
      stat.examples.push(example);
    }
    this.stats.set(key, stat);
  }

  private forget(filePath: string): void {
    const contributions = this.perFile.get(filePath);
    if (!contributions) return;
    for (const { key, kind } of contributions) {
      const stat = this.stats.get(key);
      if (!stat) continue;
      stat.count -= 1;
      // Reverse the per-kind tally too, so type frequencies don't inflate
      // permanently across edits and deletions.
      const k = stat.kinds[kind];
      if (k !== undefined) {
        if (k <= 1) delete stat.kinds[kind];
        else stat.kinds[kind] = k - 1;
      }
      if (stat.count <= 0) this.stats.delete(key);
    }
    this.perFile.delete(filePath);
  }
}

function walk(
  node: YamlNode,
  path: YamlPath,
  visit: (path: YamlPath, value: YamlNode) => void,
): void {
  if (isMap(node)) {
    for (const item of (node as YAMLMap).items as Pair[]) {
      const k = scalarKey(item.key);
      if (k === null) continue;
      const childPath = [...path, k];
      visit(childPath, item.value as YamlNode);
      if (item.value) walk(item.value as YamlNode, childPath, visit);
    }
  } else if (isSeq(node)) {
    const items = (node as YAMLSeq).items as YamlNode[];
    for (let i = 0; i < items.length; i++) {
      const childPath = [...path, i];
      visit(childPath, items[i]!);
      walk(items[i]!, childPath, visit);
    }
  }
}

function scalarKey(k: unknown): string | null {
  if (isScalar(k) && (typeof k.value === "string" || typeof k.value === "number")) {
    return String(k.value);
  }
  return null;
}
