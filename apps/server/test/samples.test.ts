import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSamples } from "../src/samples.ts";

const withFiles = async (files: Readonly<Record<string, string>>): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "autoflow-samples-"));
  await Promise.all(Object.entries(files).map(([name, body]) => writeFile(join(dir, name), body)));
  return dir;
};

describe("loadSamples", () => {
  it("takes every markdown file, titled by its first heading and ordered by name", async () => {
    const dir = await withFiles({
      "quill-memo.md": "# Quill\n\nRenters build credit.",
      "larkspur-memo.md": "# Larkspur\n\nThe market is large.",
    });

    const samples = await loadSamples(dir);

    expect(samples.map((s) => [s.id, s.title])).toEqual([
      ["larkspur", "Larkspur"],
      ["quill", "Quill"],
    ]);
    expect(samples[0]?.text).toBe("# Larkspur\n\nThe market is large.");
  });

  it("ignores anything that is not markdown", async () => {
    const dir = await withFiles({ "memo.md": "# Memo", "notes.txt": "x", "deck.pdf": "x" });
    expect((await loadSamples(dir)).map((s) => s.id)).toEqual(["memo"]);
  });

  it("falls back to the file name when a memo has no heading", async () => {
    const dir = await withFiles({ "untitled-memo.md": "No heading here." });
    expect((await loadSamples(dir))[0]).toMatchObject({ id: "untitled", title: "untitled" });
  });

  it("returns nothing for an empty directory", async () => {
    expect(await loadSamples(await withFiles({}))).toEqual([]);
  });

  it("reports a directory that is not there rather than hanging the server", async () => {
    await expect(loadSamples(join(tmpdir(), "autoflow-does-not-exist"))).rejects.toThrow();
  });
});
