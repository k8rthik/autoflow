/**
 * Runs the claim extractor against every eval case for one model and grades the output.
 *
 *   node eval/run.ts --model anthropic/claude-haiku-4.5 [--reps 2] [--variant v2] [--judge anthropic/claude-opus-4.8]
 *
 * Writes eval/results/<variant>/<model>/results.jsonl (one row per case × rep, resumable) and
 * eval/results/<model>/traces/<case>_rep<k>.json with the raw candidates and judge verdicts.
 * Requires OPENROUTER_API_KEY in the repo-root .env or the environment.
 */
import Anthropic from "@anthropic-ai/sdk";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createClaudeClaimExtractor } from "../src/index.ts";
import { loadCases, type EvalCase } from "./cases.ts";
import { excerptGrounded } from "./grounding.ts";
import { DEFAULT_JUDGE_MODEL, judgeAlignments } from "./judge.ts";
import { score } from "./scoring.ts";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, "../../..");
const CASES_DIR = join(here, "cases");
const RESULTS_DIR = join(here, "results");
const OPENROUTER_BASE_URL = "https://openrouter.ai/api";
const REQUEST_TIMEOUT_MS = 180_000;

const loadEnv = (): void => {
  const envPath = join(REPO_ROOT, ".env");
  if (existsSync(envPath)) process.loadEnvFile(envPath);
};

const safeDirName = (model: string): string => model.replace(/[^a-z0-9.-]+/gi, "_");

interface ResultRow {
  readonly prompt_id: string;
  readonly rep: number;
  readonly requested_model: string;
  readonly model: string | null;
  readonly status: "ok" | "error" | "model_mismatch";
  readonly stop_reason: string | null;
  readonly error?: string;
  readonly counts: { readonly gold: number; readonly candidates: number };
  readonly grade: Record<string, number> | null;
  readonly latency_s: number | null;
  readonly usage: { readonly input_tokens: number; readonly output_tokens: number } | null;
  readonly judge_model: string | null;
  readonly judge_usage: { readonly input_tokens: number; readonly output_tokens: number } | null;
}

const completedKeys = async (resultsPath: string): Promise<ReadonlySet<string>> => {
  if (!existsSync(resultsPath)) return new Set();
  const lines = (await readFile(resultsPath, "utf8")).split("\n").filter((l) => l.trim() !== "");
  return new Set(lines.map((l) => JSON.parse(l) as ResultRow).map((r) => `${r.prompt_id}#${r.rep}`));
};

interface RunOptions {
  readonly client: Anthropic;
  readonly model: string;
  readonly judgeModel: string;
  readonly outDir: string;
}

const runOne = async (opts: RunOptions, evalCase: EvalCase, rep: number): Promise<ResultRow> => {
  const base = { prompt_id: evalCase.id, rep, requested_model: opts.model, counts: { gold: evalCase.gold.length, candidates: 0 } };
  const extractor = createClaudeClaimExtractor({ client: opts.client, model: opts.model });
  const extraction = await extractor.extractClaims(evalCase.memoText);

  if (!extraction.ok) {
    return { ...base, model: null, status: "error", stop_reason: null, error: `${extraction.error.code}: ${extraction.error.message}`, grade: null, latency_s: null, usage: null, judge_model: null, judge_usage: null };
  }

  const { meta } = extraction;
  // Gold is flat, so grade claims and their evidence together as one candidate list.
  const claims = extraction.claims.flatMap((c) => [{ text: c.text, excerpt: c.excerpt }, ...c.evidence]);
  const candidates = claims.map((c) => c.text);
  const judged = await judgeAlignments(opts.client, opts.judgeModel, {
    memo: evalCase.memoText,
    gold: evalCase.gold,
    forbidden: evalCase.forbidden,
    candidates,
  });
  const grounded = claims.filter((c) => excerptGrounded(evalCase.memoText, c.excerpt)).length;
  const grade = {
    ...score(evalCase.gold.length, candidates.length, judged.alignments),
    grounded_rate: candidates.length === 0 ? 0 : grounded / candidates.length,
  };

  await mkdir(join(opts.outDir, "traces"), { recursive: true });
  await writeFile(
    join(opts.outDir, "traces", `${evalCase.id}_rep${rep}.json`),
    JSON.stringify({ case: evalCase.id, model: meta.model, claims, alignments: judged.alignments, grade }, null, 2),
  );

  return {
    ...base,
    counts: { gold: evalCase.gold.length, candidates: candidates.length },
    model: meta.model,
    status: meta.model === opts.model ? "ok" : "model_mismatch",
    stop_reason: meta.stopReason,
    grade,
    latency_s: meta.latencyMs / 1000,
    usage: { input_tokens: meta.inputTokens, output_tokens: meta.outputTokens },
    judge_model: judged.model,
    judge_usage: judged.usage,
  };
};

const errorRow = (evalCase: EvalCase, rep: number, model: string, error: unknown): ResultRow => ({
  prompt_id: evalCase.id,
  rep,
  requested_model: model,
  model: null,
  status: "error",
  stop_reason: null,
  error: error instanceof Error ? error.message : String(error),
  counts: { gold: evalCase.gold.length, candidates: 0 },
  grade: null,
  latency_s: null,
  usage: null,
  judge_model: null,
  judge_usage: null,
});

const main = async (): Promise<void> => {
  loadEnv();
  const { values } = parseArgs({
    options: {
      model: { type: "string" },
      reps: { type: "string", default: "1" },
      judge: { type: "string", default: DEFAULT_JUDGE_MODEL },
      variant: { type: "string", default: "baseline" },
    },
  });
  if (!values.model) throw new Error("--model is required");
  const reps = Number(values.reps);
  if (!Number.isInteger(reps) || reps < 1) throw new Error("--reps must be a positive integer");
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  const client = new Anthropic({ apiKey, baseURL: OPENROUTER_BASE_URL, timeout: REQUEST_TIMEOUT_MS, maxRetries: 3 });
  const outDir = join(RESULTS_DIR, values.variant, safeDirName(values.model));
  const resultsPath = join(outDir, "results.jsonl");
  await mkdir(outDir, { recursive: true });

  const cases = await loadCases(CASES_DIR, REPO_ROOT);
  const done = await completedKeys(resultsPath);
  const opts: RunOptions = { client, model: values.model, judgeModel: values.judge, outDir };

  for (const evalCase of cases) {
    for (let rep = 0; rep < reps; rep++) {
      if (done.has(`${evalCase.id}#${rep}`)) continue;
      const row = await runOne(opts, evalCase, rep).catch((error: unknown) => errorRow(evalCase, rep, values.model!, error));
      await appendFile(resultsPath, `${JSON.stringify(row)}\n`);
      const summary = row.grade ? `P=${row.grade["precision"]?.toFixed(2)} R=${row.grade["recall"]?.toFixed(2)} n=${row.counts.candidates} ${row.latency_s?.toFixed(1)}s` : `ERROR ${row.error}`;
      process.stderr.write(`${values.model}  ${evalCase.id} rep${rep}  ${row.status}  ${summary}\n`);
    }
  }
};

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
