/**
 * Aggregates every eval/results/<model>/results.jsonl into one comparison table (markdown on stdout).
 * Cost is derived at report time from each row's served model × usage using OpenRouter's current prices.
 *
 *   node eval/report.ts [--variant baseline] [--json]
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { costUsd, fetchOpenRouterPrices, type PriceTable } from "./pricing.ts";

const RESULTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "results");

interface Row {
  readonly prompt_id: string;
  readonly requested_model: string;
  readonly model: string | null;
  readonly status: string;
  readonly counts: { gold: number; candidates: number };
  readonly grade: Record<string, number> | null;
  readonly latency_s: number | null;
  readonly usage: { input_tokens: number; output_tokens: number } | null;
}

interface ModelSummary {
  readonly model: string;
  readonly runs: number;
  readonly errors: number;
  readonly precision: number;
  readonly recall: number;
  readonly f1: number;
  readonly grounded: number;
  readonly leak: number;
  readonly compound: number;
  readonly claimsPerMemo: number;
  readonly medianLatency: number;
  readonly p90Latency: number;
  readonly costPerMemo: number | null;
}

const mean = (xs: readonly number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
const quantile = (xs: readonly number[], q: number): number => {
  if (xs.length === 0) return 0;
  const sorted = xs.toSorted((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
};

const readRows = async (dir: string): Promise<readonly Row[]> => {
  const text = await readFile(join(dir, "results.jsonl"), "utf8").catch(() => "");
  return text.split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l) as Row);
};

const summarise = (rows: readonly Row[], prices: PriceTable): ModelSummary => {
  const ok = rows.filter((r) => r.status === "ok" && r.grade && r.usage && r.latency_s !== null);
  const metric = (key: string) => mean(ok.map((r) => r.grade?.[key] ?? 0));
  const costs = ok.map((r) => costUsd(prices, r.model ?? "", r.usage!)).filter((c): c is number => c !== null);
  return {
    model: rows[0]?.requested_model ?? "?",
    runs: rows.length,
    errors: rows.length - ok.length,
    precision: metric("precision"),
    recall: metric("recall"),
    f1: metric("f1"),
    grounded: metric("grounded_rate"),
    leak: metric("leak_rate"),
    compound: metric("compound_rate"),
    claimsPerMemo: mean(ok.map((r) => r.counts.candidates)),
    medianLatency: quantile(ok.map((r) => r.latency_s!), 0.5),
    p90Latency: quantile(ok.map((r) => r.latency_s!), 0.9),
    costPerMemo: costs.length === 0 ? null : mean(costs),
  };
};

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const usd = (x: number | null) => (x === null ? "n/a" : `$${x.toFixed(4)}`);

const toMarkdown = (summaries: readonly ModelSummary[]): string => {
  const header = "| Model | Runs | Err | Precision | Recall | F1 | Grounded | Leak | Compound | Claims/memo | Latency p50 | p90 | Cost/memo |";
  const sep = "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|";
  const lines = summaries.map(
    (s) =>
      `| ${s.model} | ${s.runs} | ${s.errors} | ${pct(s.precision)} | ${pct(s.recall)} | ${pct(s.f1)} | ${pct(s.grounded)} | ${pct(s.leak)} | ${pct(s.compound)} | ${s.claimsPerMemo.toFixed(1)} | ${s.medianLatency.toFixed(1)}s | ${s.p90Latency.toFixed(1)}s | ${usd(s.costPerMemo)} |`,
  );
  return [header, sep, ...lines].join("\n");
};

const main = async (): Promise<void> => {
  const { values } = parseArgs({ options: { json: { type: "boolean", default: false }, variant: { type: "string", default: "baseline" } } });
  const variantDir = join(RESULTS_DIR, values.variant);
  const dirs = (await readdir(variantDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  const prices = await fetchOpenRouterPrices();
  const summaries = (await Promise.all(dirs.map(async (d) => summarise(await readRows(join(variantDir, d)), prices))))
    .filter((s) => s.runs > 0)
    .toSorted((a, b) => b.f1 - a.f1);
  process.stdout.write(values.json ? `${JSON.stringify(summaries, null, 2)}\n` : `${toMarkdown(summaries)}\n`);
};

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
