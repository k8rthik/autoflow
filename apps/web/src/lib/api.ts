import type { MemoFigure } from "@autoflow/classifier";
import type { FlowEvent } from "@autoflow/core";

export interface ApiError {
  readonly code: string;
  readonly message: string;
}

export type ApiResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ApiError };

export interface MemoResponse {
  readonly title: string;
  readonly events: readonly FlowEvent[];
  readonly model: string;
  readonly latencyMs: number;
}

export interface MemoDocument {
  readonly title: string;
  readonly markdown: string;
  readonly figures: readonly MemoFigure[];
}

export interface SampleSummary {
  readonly id: string;
  readonly title: string;
}

interface Envelope<T> {
  readonly ok: boolean;
  readonly data: T | null;
  readonly error: ApiError | null;
}

const NETWORK_ERROR: ApiError = { code: "NETWORK", message: "Could not reach the server. Is it running?" };
const MALFORMED: ApiError = { code: "MALFORMED", message: "The server returned something unexpected" };

const isEnvelope = (value: unknown): value is Envelope<unknown> =>
  typeof value === "object" && value !== null && "ok" in value && "data" in value && "error" in value;

/** Turns a raw envelope into a typed result. Exported for tests; `request` is the thing to call. */
export const parseEnvelope = <T>(body: unknown, isData: (d: unknown) => d is T): ApiResult<T> => {
  if (!isEnvelope(body)) return { ok: false, error: MALFORMED };
  if (!body.ok) return { ok: false, error: body.error ?? MALFORMED };
  return isData(body.data) ? { ok: true, value: body.data } : { ok: false, error: MALFORMED };
};

const request = async <T>(path: string, init: RequestInit, isData: (d: unknown) => d is T): Promise<ApiResult<T>> => {
  try {
    const response = await fetch(path, init);
    return parseEnvelope(await response.json(), isData);
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
};

const isMemoResponse = (d: unknown): d is MemoResponse =>
  typeof d === "object" && d !== null && typeof (d as MemoResponse).title === "string" && Array.isArray((d as MemoResponse).events);

const isSampleList = (d: unknown): d is { samples: SampleSummary[] } =>
  typeof d === "object" && d !== null && Array.isArray((d as { samples: unknown }).samples);

const isSample = (d: unknown): d is { id: string; title: string; text: string } =>
  typeof d === "object" && d !== null && typeof (d as { text: unknown }).text === "string";

const isMemoDocument = (d: unknown): d is MemoDocument =>
  typeof d === "object" &&
  d !== null &&
  typeof (d as MemoDocument).markdown === "string" &&
  typeof (d as MemoDocument).title === "string" &&
  Array.isArray((d as MemoDocument).figures);

export const buildFlow = (memo: string, figures: readonly MemoFigure[] = []) =>
  request(
    "/api/memo",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ memo, figures }) },
    isMemoResponse,
  );

/** Uploads a .docx or text file; the server converts it and returns markdown plus figures for review. */
export const parseMemoFile = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return request("/api/memo/parse", { method: "POST", body: form }, isMemoDocument);
};

export const listSamples = () => request("/api/samples", {}, isSampleList);

export const fetchSample = (id: string) => request(`/api/samples/${encodeURIComponent(id)}`, {}, isSample);
