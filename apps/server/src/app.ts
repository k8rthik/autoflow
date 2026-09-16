import { memoToEvents, randomIds, type ClaimExtractor, type ExtractionError, type IdFactory } from "@autoflow/classifier";
import type { FlowEvent } from "@autoflow/core";
import { ingestFile, MAX_UPLOAD_BYTES, type IngestError, type MemoDocument } from "@autoflow/ingest";
import { Hono } from "hono";
import { z } from "zod";
import { titleOf, type Sample } from "./samples.ts";

export interface AppDeps {
  readonly extractor: ClaimExtractor;
  readonly model: string;
  readonly samples: () => Promise<readonly Sample[]>;
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

export interface MemoResponse {
  readonly title: string;
  readonly events: readonly FlowEvent[];
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

  app.post("/api/memo", async (c) => {
    const body = MemoRequest.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json(fail({ code: "INVALID_REQUEST", message: `Body must be { memo: string } with at most ${MAX_MEMO_CHARS} characters` }), 400);
    }
    const result = await deps.extractor.extractClaims({ markdown: body.data.memo, figures: body.data.figures });
    if (!result.ok) return c.json(fail(result.error), statusFor(result.error));

    const response: MemoResponse = {
      title: titleOf(body.data.memo, "Untitled memo"),
      events: memoToEvents(result.claims, deps.makeId ?? randomIds()),
      model: result.meta.model,
      latencyMs: result.meta.latencyMs,
    };
    return c.json(ok(response));
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
