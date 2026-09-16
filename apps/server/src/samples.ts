import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

export interface Sample {
  readonly id: string;
  readonly title: string;
  readonly text: string;
}

/** First markdown heading, minus the hashes; falls back to the given default. */
export const titleOf = (memo: string, fallback: string): string => {
  const heading = memo.split("\n").find((line) => /^#\s+/.test(line));
  return heading ? heading.replace(/^#\s+/, "").trim() : fallback;
};

/** Every *.md in the directory becomes a sample the UI can offer. */
export const loadSamples = async (dir: string): Promise<readonly Sample[]> => {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md")).toSorted();
  return Promise.all(
    files.map(async (file) => {
      const text = await readFile(join(dir, file), "utf8");
      const id = basename(file, ".md").replace(/-memo$/, "");
      return { id, title: titleOf(text, id), text };
    }),
  );
};
