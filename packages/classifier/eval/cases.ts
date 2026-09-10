import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const CaseSchema = z.object({
  id: z.string().min(1),
  memo: z.string().min(1),
  gold: z.array(z.string().min(1)).min(1),
  forbidden: z.array(z.string().min(1)),
});

export interface EvalCase extends z.infer<typeof CaseSchema> {
  readonly memoText: string;
}

/** Loads every case JSON in `casesDir`; memo paths are relative to `repoRoot`. Fails loudly on a malformed case. */
export const loadCases = async (casesDir: string, repoRoot: string): Promise<readonly EvalCase[]> => {
  const files = (await readdir(casesDir)).filter((f) => f.endsWith(".json")).toSorted();
  return Promise.all(
    files.map(async (file) => {
      const parsed = CaseSchema.safeParse(JSON.parse(await readFile(join(casesDir, file), "utf8")));
      if (!parsed.success) throw new Error(`Malformed case ${file}: ${parsed.error.message}`);
      return { ...parsed.data, memoText: await readFile(join(repoRoot, parsed.data.memo), "utf8") };
    }),
  );
};
