import { App, normalizePath } from "obsidian";
import type { JsonSchema } from "./jsonschema";

/**
 * Loads explicit JSON Schema files from a configured directory (default
 * `yaml-schemas/` under the vault config dir). Files are keyed by basename (without `.json`)
 * and, if present, by their `$id` — either can be used in a `_schema:` /
 * `# yaml-schema:` directive.
 *
 * Reads through the vault adapter rather than `getFiles()` because the schema
 * directory normally lives under the config dir, outside the indexed vault.
 */
export class SchemaStore {
  private schemas = new Map<string, JsonSchema>();

  constructor(private app: App, private getDir: () => string) {}

  get size(): number {
    return this.schemas.size;
  }

  get(name: string): JsonSchema | undefined {
    return this.schemas.get(name);
  }

  names(): string[] {
    return [...this.schemas.keys()];
  }

  /** Reload all schema files from disk. Returns the number of files loaded. */
  async reload(): Promise<number> {
    this.schemas.clear();
    const raw = this.getDir();
    const dir = normalizePath(raw.startsWith("/") || raw.includes(":/") ? raw : `${this.app.vault.configDir}/${raw}`);
    const adapter = this.app.vault.adapter;
    let loaded = 0;
    try {
      if (!(await adapter.exists(dir))) return 0;
      const { files } = await adapter.list(dir);
      for (const path of files) {
        if (!path.toLowerCase().endsWith(".json")) continue;
        try {
          const json = JSON.parse(await adapter.read(path)) as JsonSchema;
          const base = path.split("/").pop()!.replace(/\.json$/i, "");
          this.schemas.set(base, json);
          if (typeof json.$id === "string") this.schemas.set(json.$id, json);
          loaded++;
        } catch (e) {
          console.warn(`[yaml-editor] failed to load schema ${path}`, e);
        }
      }
    } catch (e) {
      console.warn("[yaml-editor] could not read schema directory", dir, e);
    }
    return loaded;
  }
}
