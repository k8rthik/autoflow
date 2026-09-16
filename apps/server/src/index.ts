import { createConfiguredExtractor } from "@autoflow/classifier";
import { serve } from "@hono/node-server";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";
import { loadSamples } from "./samples.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const DEFAULT_PORT = 3001;

const envPath = join(REPO_ROOT, ".env");
if (existsSync(envPath)) process.loadEnvFile(envPath);

const configured = createConfiguredExtractor(process.env, process.env["AUTOFLOW_MODEL"]);
if (!configured.ok) {
  console.error(configured.error);
  process.exit(1);
}

const port = Number(process.env["PORT"] ?? DEFAULT_PORT);
const app = createApp({
  extractor: configured.value.extractor,
  model: configured.value.model,
  samples: () => loadSamples(join(REPO_ROOT, "examples")),
});

serve({ fetch: app.fetch, port }, () => {
  console.log(`autoflow server on http://localhost:${port} (${configured.value.provider.name}, ${configured.value.model})`);
});
