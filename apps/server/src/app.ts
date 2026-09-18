import { memoToEvents, randomIds, type ClaimExtractor, type ExtractionError, type IdFactory } from "@autoflow/classifier";
import type { RecordedEvent } from "@autoflow/core";
import { ingestFile, MAX_UPLOAD_BYTES, type IngestError, type MemoDocument } from "@autoflow/ingest";
import type { Session } from "@autoflow/storage";
import { Hono } from "hono";
import { z } from "zod";
import { SubmitEventsSchema, toFlowEvent } from "./event-schema.ts";
import type { HubError, SessionHub } from "./hub.ts";
import { titleOf, type Sample } from "./samples.ts";

export interface AppDeps {
  readonly extractor: ClaimExtractor;
  readonly model: string;
  readonly samples: () => Promise<readonly Sample[]>;
  readonly hub: SessionHub;
  readonly makeId?: IdFactory;
}

const MAX_MEMO_CHARS = 200_000;
const MAX_FIGURES = 40;
const MAX_FIGURE_BASE64_CHARS = 6_500_000;

const FigureSchema = z.object({
  index: z.number().int().min(1),
  mediaType: z.enum(["image/png", "image/jpeg", "image/gif", "image/webp"]),
  data: z.string().min(1).max(MAX_FIGURE_BASE64_CHARS),
});
const MemoRequest = z.object({
  memo: z.string().trim().min(1).max(MAX_MEMO_CHARS),
  figures: z.array(FigureSchema).max(MAX_FIGURES).default([]),
});

export interface SessionResponse {
  readonly session: Session;
  readonly events: readonly RecordedEvent[];
  readonly model: string;
  readonly latencyMs: number;
}

type ApiError = { readonly code: string; readonly message: string };
const ok = <T>(data: T) => ({ ok: true as const, data, error: null });
const fail = (error: ApiError) => ({ ok: false as const, data: null, error });

/** Extraction failures the caller can fix are 400; upstream model problems are 502. */
const statusFor = (error: ExtractionError): 400 | 502 => (error.code === "EMPTY_MEMO" ? 400 : 502);

/** Every ingest failure is about the file the caller sent. */
const ingestStatus = (_error: IngestError): 400 => 400;

/**
 * A missing session is 404; an event the domain refuses is 409, because the client's view of the
 * flow is behind rather than its request being malformed; a lost race is 409 for the same reason.
 */
const hubStatus = (error: HubError): 404 | 409 => (error.code === "SESSION_NOT_FOUND" ? 404 : 409);

const fileFromForm = (body: Record<string, unknown>): File | null => {
  const file = body["file"];
  return file instanceof File ? file : null;
};

export const createApp = (deps: AppDeps) => {
  const app = new Hono();

  app.get("/api/health", (c) => c.json(ok({ model: deps.model })));

  app.get("/api/samples", async (c) => {
    const samples = await deps.samples();
    return c.json(ok({ samples: samples.map(({ id, title }) => ({ id, title })) }));
  });

  app.get("/api/samples/:id", async (c) => {
    const sample = (await deps.samples()).find((s) => s.id === c.req.param("id"));
    return sample ? c.json(ok(sample)) : c.json(fail({ code: "NOT_FOUND", message: "No sample with that id" }), 404);
  });

  /** Memo in, persisted session out. The seeded log is the session's first events. */
  app.post("/api/sessions", async (c) => {
    const body = MemoRequest.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json(fail({ code: "INVALID_REQUEST", message: `Body must be { memo: string } with at most ${MAX_MEMO_CHARS} characters` }), 400);
    }
    const result = await deps.extractor.extractClaims({ markdown: body.data.memo, figures: body.data.figures });
    if (!result.ok) return c.json(fail(result.error), statusFor(result.error));

    const created = await deps.hub.create({
      title: titleOf(body.data.memo, "Untitled memo"),
      events: memoToEvents(result.claims, deps.makeId ?? randomIds()),
    });
    if (!created.ok) return c.json(fail(created.error), hubStatus(created.error));

    const response: SessionResponse = { ...created.value, model: result.meta.model, latencyMs: result.meta.latencyMs };
    return c.json(ok(response), 201);
  });

  app.get("/api/sessions", async (c) => c.json(ok({ sessions: await deps.hub.list() })));

  app.get("/api/sessions/:id", async (c) => {
    const snapshot = await deps.hub.snapshot(c.req.param("id"));
    return snapshot.ok ? c.json(ok(snapshot.value)) : c.json(fail(snapshot.error), hubStatus(snapshot.error));
  });

  /** Corrections from the room. Validated against the current flow before anything is appended. */
  app.post("/api/sessions/:id/events", async (c) => {
    const body = SubmitEventsSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json(fail({ code: "INVALID_REQUEST", message: "Body must be { events: FlowEvent[] }" }), 400);
    }

    const submitted = await deps.hub.submit({
      sessionId: c.req.param("id"),
      events: body.data.events.map(toFlowEvent),
      actor: "participant",
    });
    return submitted.ok ? c.json(ok({ events: submitted.value })) : c.json(fail(submitted.error), hubStatus(submitted.error));
  });

  /** Multipart upload of a .docx or text file → MemoDocument the client can review before building. */
  app.post("/api/memo/parse", async (c) => {
    const body = await c.req.parseBody().catch(() => null);
    const file = body ? fileFromForm(body) : null;
    if (!file) return c.json(fail({ code: "INVALID_REQUEST", message: 'Send multipart form data with a "file" field' }), 400);
    if (file.size > MAX_UPLOAD_BYTES) {
      return c.json(fail({ code: "TOO_LARGE", message: `Files must be under ${MAX_UPLOAD_BYTES / 1_000_000} MB` }), 413);
    }
    const parsed = await ingestFile(file.name, Buffer.from(await file.arrayBuffer()));
    if (!parsed.ok) return c.json(fail(parsed.error), ingestStatus(parsed.error));
    const document: MemoDocument = parsed.value;
    return c.json(ok(document));
  });

  app.onError((error, c) => {
    console.error("[server] unhandled error", error);
    return c.json(fail({ code: "INTERNAL", message: "Something went wrong on the server" }), 500);
  });

  return app;
};
