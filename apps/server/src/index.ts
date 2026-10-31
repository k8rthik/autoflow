import { createConfiguredExtractor } from "@autoflow/classifier";
import { serve } from "@hono/node-server";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSqliteEventStore } from "@autoflow/storage";
import { createConfiguredTranscriber } from "@autoflow/transcription";
import { randomUUID } from "node:crypto";
import { createApp } from "./app.ts";
import { createSessionHub } from "./hub.ts";
import { attachLiveUpdates } from "./live.ts";
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
const dbPath = process.env["AUTOFLOW_DB"] ?? join(REPO_ROOT, "data", "autoflow.db");
const store = createSqliteEventStore(dbPath);
const hub = createSessionHub({ store, makeId: randomUUID });

const transcription = createConfiguredTranscriber(process.env);
if (!transcription.ok) console.warn(transcription.error);

const app = createApp({
  extractor: configured.value.extractor,
  model: configured.value.model,
  samples: () => loadSamples(join(REPO_ROOT, "examples")),
  hub,
});

const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`autoflow server on http://localhost:${port} (${configured.value.provider.name}, ${configured.value.model})`);
  console.log(`event log: ${dbPath}`);
  if (transcription.ok) console.log("live transcription: Deepgram, audio at /ws/sessions/:id/audio");
});

attachLiveUpdates(server, { hub, transcriber: transcription.ok ? transcription.value : null });

const shutDown = (): void => {
  server.close(() => {
    store.close();
    process.exit(0);
  });
};

process.on("SIGINT", shutDown);
process.on("SIGTERM", shutDown);
