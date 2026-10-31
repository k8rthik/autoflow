import { createDeepgramTranscriber } from "./deepgram.ts";
import type { Transcriber } from "./types.ts";

export type ConfiguredTranscriberResult = { readonly ok: true; readonly value: Transcriber } | { readonly ok: false; readonly error: string };

export const NO_DEEPGRAM_KEY_MESSAGE = "Live transcription is off: set DEEPGRAM_API_KEY in .env (see .env.example) to turn it on.";

/** Reads the Deepgram key from the environment. The only place the key is looked up. */
export const createConfiguredTranscriber = (env: Readonly<Record<string, string | undefined>>): ConfiguredTranscriberResult => {
  const apiKey = env["DEEPGRAM_API_KEY"]?.trim();
  if (!apiKey) return { ok: false, error: NO_DEEPGRAM_KEY_MESSAGE };
  return { ok: true, value: createDeepgramTranscriber({ apiKey }) };
};
