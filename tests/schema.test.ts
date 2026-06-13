import { describe, it, expect } from "vitest";
import { SchemaTracker } from "../src/yaml/schema";

/** Build a tracker whose vault is the given map of path -> file contents. */
function trackerFor(files: Record<string, string>) {
  const fileObjs = Object.keys(files).map((path) => ({ path, extension: "md" }));
  const app = {
    vault: {
      getMarkdownFiles: () => fileObjs,
      cachedRead: async (f: { path: string }) => files[f.path] ?? "",
    },
  };
  return { tracker: new SchemaTracker(app as never), fileObjs };
}

describe("SchemaTracker", () => {
  it("infers keys observed at the top level", async () => {
    const { tracker } = trackerFor({
      "a.md": "---\ntitle: A\ntags:\n  - x\n---\n",
      "b.md": "---\ntitle: B\n---\n",
    });
    await tracker.initialize();
    const keys = tracker.keysAt([]).map((s) => s.path);
    expect(keys).toContain("title");
    expect(keys).toContain("tags");
    // title appears in both files; ranked above tags.
    expect(tracker.get("title")!.count).toBe(2);
  });

  it("records value kinds for a path", async () => {
    const { tracker } = trackerFor({ "a.md": "---\ncount: 5\n---\n" });
    await tracker.initialize();
    expect(tracker.get("count")!.kinds.integer).toBe(1);
  });

  it("reverses kind tallies when a file is rescanned (no inflation)", async () => {
    const files: Record<string, string> = { "a.md": "---\ncount: 5\n---\n" };
    const { tracker, fileObjs } = trackerFor(files);
    await tracker.initialize();
    expect(tracker.get("count")!.kinds.integer).toBe(1);

    // The file changes: count is now a string. Rescan the same file.
    files["a.md"] = "---\ncount: hello\n---\n";
    await (tracker as never as { scan: (f: unknown) => Promise<void> }).scan(fileObjs[0]);

    const stat = tracker.get("count")!;
    expect(stat.count).toBe(1); // still one occurrence, not two
    expect(stat.kinds.integer).toBeUndefined(); // old kind fully reversed
    expect(stat.kinds.string).toBe(1);
  });

  it("queries child keys at a nested path", async () => {
    const { tracker } = trackerFor({
      "a.md": "---\ndataview:\n  project: P\n  status: open\n---\n",
    });
    await tracker.initialize();
    const children = tracker.keysAt(["dataview"]).map((s) => s.path);
    expect(children).toContain("dataview.project");
    expect(children).toContain("dataview.status");
  });
});
