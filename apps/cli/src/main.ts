#!/usr/bin/env node
import Anthropic from "@anthropic-ai/sdk";
import { createClaudeClaimExtractor, randomIds } from "@autoflow/classifier";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { runMemoCommand } from "./memo-command.ts";
import { resolveProvider } from "./provider.ts";

const USAGE = `Usage:
  autoflow memo <memo-file> [--out <dir>] [--model <id>]

Reads a memo, extracts its claims with Claude, and prints the seeded flow.
With --out, also writes flow.events.json and flow.md to that directory.
Credentials: ANTHROPIC_API_KEY or OPENROUTER_API_KEY, from the shell or a .env file.`;

const EXIT_USAGE = 2;
const EXIT_FAILURE = 1;

const fail = (message: string, code = EXIT_FAILURE): never => {
  process.stderr.write(`${message}\n`);
  process.exit(code);
};

const writeOutputs = async (dir: string, events: unknown, markdown: string): Promise<void> => {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "flow.events.json"), JSON.stringify(events, null, 2));
  await writeFile(join(dir, "flow.md"), markdown);
};

/** Loads .env from the working directory if present. Shell variables take precedence. */
const loadDotEnv = (): void => {
  if (existsSync(".env")) process.loadEnvFile(".env");
};

const memoCommand = async (args: readonly string[]): Promise<void> => {
  const { values, positionals } = parseArgs({
    args: [...args],
    options: { out: { type: "string" }, model: { type: "string" } },
    allowPositionals: true,
  });
  const memoPath = positionals[0];
  if (!memoPath) return fail(USAGE, EXIT_USAGE);

  const memoText = await readFile(memoPath, "utf8").catch((e: NodeJS.ErrnoException) =>
    fail(`Could not read memo at ${memoPath}: ${e.message}`),
  );

  const provider = resolveProvider(process.env);
  if (!provider.ok) return fail(provider.error);
  const client = new Anthropic(provider.value.clientOptions);
  const extractor = createClaudeClaimExtractor({ client, model: values.model ?? provider.value.defaultModel });
  process.stderr.write(`Extracting claims via ${provider.value.name} (${values.model ?? provider.value.defaultModel})...\n`);
  const result = await runMemoCommand({ memoText, extractor, makeId: randomIds() });
  if (!result.ok) return fail(`Could not extract claims (${result.error.code}): ${result.error.message}`);

  process.stdout.write(`${result.value.text}\n`);
  if (values.out) {
    await writeOutputs(values.out, result.value.events, result.value.markdown);
    process.stderr.write(`\nWrote flow.events.json and flow.md to ${values.out}\n`);
  }
};

loadDotEnv();
const [command, ...rest] = process.argv.slice(2);
if (command === "memo") {
  memoCommand(rest).catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
} else {
  fail(USAGE, EXIT_USAGE);
}
