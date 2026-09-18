import type { MemoFigure } from "@autoflow/classifier";
import type { FlowEvent, RecordedEvent } from "@autoflow/core";

export interface ApiError {
  readonly code: string;
  readonly message: string;
}

export type ApiResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ApiError };

export interface Session {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
}

export interface SessionResponse {
  readonly session: Session;
  readonly events: readonly RecordedEvent[];
  readonly model: string;
  readonly latencyMs: number;
}

export interface Snapshot {
  readonly session: Session;
  readonly events: readonly RecordedEvent[];
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

const isSnapshot = (d: unknown): d is Snapshot => {
  if (typeof d !== "object" || d === null) return false;
  const { session, events } = d as Snapshot;
  return typeof session === "object" && session !== null && typeof session.id === "string" && Array.isArray(events);
};

const isSessionResponse = (d: unknown): d is SessionResponse => isSnapshot(d);

const isRecordedEvents = (d: unknown): d is { events: readonly RecordedEvent[] } =>
  typeof d === "object" && d !== null && Array.isArray((d as { events: unknown }).events);

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

/** Builds the flow and opens a session for it. The returned log is the session's first events. */
export const createSession = (memo: string, figures: readonly MemoFigure[] = []) =>
  request(
    "/api/sessions",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ memo, figures }) },
    isSessionResponse,
  );

export const fetchSession = (id: string) => request(`/api/sessions/${encodeURIComponent(id)}`, {}, isSnapshot);

/** Corrections go to the server, which validates them against the log before anything is committed. */
export const submitEvents = (id: string, events: readonly FlowEvent[]) =>
  request(
    `/api/sessions/${encodeURIComponent(id)}/events`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ events }) },
    isRecordedEvents,
  );

/** Uploads a .docx or text file; the server converts it and returns markdown plus figures for review. */
export const parseMemoFile = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return request("/api/memo/parse", { method: "POST", body: form }, isMemoDocument);
};

export const listSamples = () => request("/api/samples", {}, isSampleList);

export const fetchSample = (id: string) => request(`/api/samples/${encodeURIComponent(id)}`, {}, isSample);
