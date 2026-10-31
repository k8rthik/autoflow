import type { TranscriptSegment } from "@autoflow/core";
import { z } from "zod";

export const DEEPGRAM_LISTEN_URL = "wss://api.deepgram.com/v1/listen";
/** Deepgram's current streaming model, and the one that accepts `keyterm` vocabulary hints. */
export const DEFAULT_DEEPGRAM_MODEL = "nova-3";

/** Text frames we send. Audio goes as binary frames. */
export const CLOSE_STREAM = JSON.stringify({ type: "CloseStream" });

const ResultsSchema = z.object({
  type: z.literal("Results"),
  start: z.number().min(0),
  duration: z.number().min(0),
  is_final: z.boolean(),
  channel: z.object({
    alternatives: z.array(z.object({ transcript: z.string(), confidence: z.number().min(0).max(1) })),
  }),
});

const ErrorSchema = z.object({
  type: z.literal("Error"),
  description: z.string().optional(),
  message: z.string().optional(),
});

export type DeepgramResult = z.infer<typeof ResultsSchema>;

/**
 * What a frame from Deepgram means to us. Metadata, SpeechStarted, UtteranceEnd and anything newer
 * are `ignored`: segments come only from Results, and an unknown frame must not end the stream.
 */
export type ServerMessage =
  | { readonly kind: "result"; readonly result: DeepgramResult }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "ignored" };

const IGNORED: ServerMessage = { kind: "ignored" };

export const parseServerMessage = (text: string): ServerMessage => {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return IGNORED;
  }
  const results = ResultsSchema.safeParse(json);
  if (results.success) return { kind: "result", result: results.data };
  const error = ErrorSchema.safeParse(json);
  if (error.success) return { kind: "error", message: error.data.description ?? error.data.message ?? "Deepgram reported an error" };
  return IGNORED;
};

export interface ListenParams {
  readonly model: string;
  readonly vocabulary: readonly string[];
}

/** No `encoding` or `sample_rate`: the audio is containerized, and Deepgram reads the format from the container. */
export const listenUrl = (base: string, { model, vocabulary }: ListenParams): string => {
  const url = new URL(base);
  url.searchParams.set("model", model);
  url.searchParams.set("interim_results", "true");
  url.searchParams.set("smart_format", "true");
  const terms = new Set(vocabulary.map((term) => term.trim()).filter((term) => term !== ""));
  for (const term of terms) url.searchParams.append("keyterm", term);
  return url.toString();
};

/**
 * Where a stream is in its sequence of segments. Deepgram revises the current window with interim
 * results until it sends one marked final; the next result starts a new window. `shown` records
 * whether anything was emitted for the current window, so a final that withdraws it still goes out.
 */
export interface SegmentCursor {
  readonly index: number;
  readonly shown: boolean;
}

export const START: SegmentCursor = { index: 0, shown: false };

const toMs = (seconds: number): number => Math.round(seconds * 1000);

export const advance = (
  cursor: SegmentCursor,
  result: DeepgramResult,
  streamId: string,
): { readonly cursor: SegmentCursor; readonly segment: TranscriptSegment | null } => {
  const best = result.channel.alternatives[0];
  const text = best?.transcript.trim() ?? "";
  const next: SegmentCursor = result.is_final ? { index: cursor.index + 1, shown: false } : { index: cursor.index, shown: true };

  if (text === "" && (!result.is_final || !cursor.shown)) {
    return { cursor: result.is_final ? next : cursor, segment: null };
  }

  const segment: TranscriptSegment = {
    id: `${streamId}:${cursor.index}`,
    text,
    startMs: toMs(result.start),
    endMs: toMs(result.start + result.duration),
    final: result.is_final,
    confidence: best?.confidence ?? 0,
  };
  return { cursor: next, segment };
};
