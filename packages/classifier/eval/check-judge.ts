/**
 * Grader sanity check, run before any paid model pass:
 *   oracle: gold claims fed back as candidates should score ~100% precision and recall.
 *   null:   forbidden items plus nonsense should score ~0% with a high leak rate.
 *
 *   node eval/check-judge.ts [--judge <model>] [--case quill]
 */
import Anthropic from "@anthropic-ai/sdk";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadCases } from "./cases.ts";
import { DEFAULT_JUDGE_MODEL, judgeAlignments } from "./judge.ts";
import { score } from "./scoring.ts";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, "../../..");
const NONSENSE = ["The moon is made of cheese.", "Quarterly board meetings are held on Tuesdays."];

const main = async (): Promise<void> => {
  const envPath = join(REPO_ROOT, ".env");
  if (existsSync(envPath)) process.loadEnvFile(envPath);
  const { values } = parseArgs({ options: { judge: { type: "string", default: DEFAULT_JUDGE_MODEL }, case: { type: "string" } } });
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
  const client = new Anthropic({ apiKey, baseURL: "https://openrouter.ai/api", timeout: 180_000 });

  const cases = (await loadCases(join(here, "cases"), REPO_ROOT)).filter((c) => !values.case || c.id === values.case);
  for (const c of cases) {
    const input = { memo: c.memoText, gold: c.gold, forbidden: c.forbidden };
    const oracle = await judgeAlignments(client, values.judge, { ...input, candidates: [...c.gold] });
    const nullCandidates = [...c.forbidden, ...NONSENSE];
    const nul = await judgeAlignments(client, values.judge, { ...input, candidates: nullCandidates });
    const o = score(c.gold.length, c.gold.length, oracle.alignments);
    const n = score(c.gold.length, nullCandidates.length, nul.alignments);
    process.stdout.write(
      `${c.id.padEnd(10)} ORACLE P=${o.precision.toFixed(2)} R=${o.recall.toFixed(2)} compound=${o.compound_rate.toFixed(2)} | NULL P=${n.precision.toFixed(2)} R=${n.recall.toFixed(2)} leak=${n.leak_rate.toFixed(2)} | judge=${oracle.model} in/out=${oracle.usage.input_tokens}/${oracle.usage.output_tokens}\n`,
    );
    const misses = oracle.alignments.filter((a) => a.gold === null || a.gold !== a.candidate);
    if (misses.length > 0) process.stdout.write(`  oracle misaligned: ${JSON.stringify(misses)}\n`);
  }
};

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
