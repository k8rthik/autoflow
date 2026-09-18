import { afterEach, describe, expect, it, vi } from "vitest";
import { createSession, fetchSample, fetchSession, listSamples, parseEnvelope, parseMemoFile, submitEvents } from "../src/lib/api.ts";

const isString = (d: unknown): d is string => typeof d === "string";

describe("parseEnvelope", () => {
  it("unwraps a successful envelope whose data matches", () => {
    expect(parseEnvelope({ ok: true, data: "hi", error: null }, isString)).toEqual({ ok: true, value: "hi" });
  });

  it("passes the server error through on failure", () => {
    const error = { code: "REFUSED", message: "no" };
    expect(parseEnvelope({ ok: false, data: null, error }, isString)).toEqual({ ok: false, error });
  });

  it("flags a body that is not an envelope or whose data has the wrong shape", () => {
    expect(parseEnvelope("nope", isString)).toMatchObject({ ok: false, error: { code: "MALFORMED" } });
    expect(parseEnvelope({ ok: true, data: 42, error: null }, isString)).toMatchObject({ ok: false, error: { code: "MALFORMED" } });
  });
});

describe("api requests", () => {
  const respondWith = (body: unknown) =>
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => body } as Response));

  const lastCall = () => vi.mocked(globalThis.fetch).mock.calls[0]!;

  afterEach(() => vi.unstubAllGlobals());

  it("posts the memo and its figures as JSON and unwraps the session", async () => {
    const data = { session: { id: "s1", title: "Larkspur", createdAt: "now" }, events: [], model: "fake", latencyMs: 3 };
    respondWith({ ok: true, data, error: null });
    const figures = [{ index: 1, mediaType: "image/png" as const, data: "QUJD" }];

    expect(await createSession("a memo", figures)).toEqual({ ok: true, value: data });
    const [path, init] = lastCall();
    expect(path).toBe("/api/sessions");
    expect(init).toMatchObject({ method: "POST", headers: { "content-type": "application/json" } });
    expect(JSON.parse(String(init?.body))).toEqual({ memo: "a memo", figures });
  });

  it("sends an uploaded file as form data", async () => {
    respondWith({ ok: true, data: { title: "Quill", markdown: "text", figures: [] }, error: null });
    const result = await parseMemoFile(new File(["x"], "quill.docx"));

    expect(result).toMatchObject({ ok: true, value: { title: "Quill" } });
    const [path, init] = lastCall();
    expect(path).toBe("/api/memo/parse");
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("escapes a sample id into the path", async () => {
    respondWith({ ok: true, data: { id: "a b", title: "A B", text: "body" }, error: null });
    await fetchSample("a b");
    expect(lastCall()[0]).toBe("/api/samples/a%20b");
  });

  it("lists samples", async () => {
    respondWith({ ok: true, data: { samples: [{ id: "larkspur", title: "Larkspur" }] }, error: null });
    expect(await listSamples()).toEqual({ ok: true, value: { samples: [{ id: "larkspur", title: "Larkspur" }] } });
  });

  it("explains an unreachable server rather than throwing at the caller", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await createSession("a memo")).toEqual({
      ok: false,
      error: { code: "NETWORK", message: "Could not reach the server. Is it running?" },
    });
  });

  it("treats an unparseable body as a malformed response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => { throw new SyntaxError("bad json"); } } as unknown as Response));
    expect(await createSession("a memo")).toMatchObject({ ok: false, error: { code: "NETWORK" } });
  });

  it("passes a server error through to the caller", async () => {
    respondWith({ ok: false, data: null, error: { code: "REFUSED", message: "The model refused" } });
    expect(await createSession("a memo")).toEqual({ ok: false, error: { code: "REFUSED", message: "The model refused" } });
  });

  it("flags a success envelope whose payload is the wrong shape", async () => {
    respondWith({ ok: true, data: { title: "Larkspur" }, error: null });
    expect(await createSession("a memo")).toMatchObject({ ok: false, error: { code: "MALFORMED" } });
  });

  it("reads a session back by id", async () => {
    const data = { session: { id: "s1", title: "Larkspur", createdAt: "now" }, events: [] };
    respondWith({ ok: true, data, error: null });

    expect(await fetchSession("s1")).toEqual({ ok: true, value: data });
    expect(lastCall()[0]).toBe("/api/sessions/s1");
  });

  it("posts corrections to the session's event route", async () => {
    const event = { type: "ClaimRemoved" as const, claimId: "c1" };
    respondWith({ ok: true, data: { events: [{ seq: 2, at: "now", actor: "participant", event }] }, error: null });

    const result = await submitEvents("s1", [event]);

    expect(result).toMatchObject({ ok: true, value: { events: [{ seq: 2 }] } });
    const [path, init] = lastCall();
    expect(path).toBe("/api/sessions/s1/events");
    expect(JSON.parse(String(init?.body))).toEqual({ events: [event] });
  });

  it("passes a refused correction back with the server's reason", async () => {
    respondWith({ ok: false, data: null, error: { code: "CLAIM_NOT_FOUND", message: "No claim c1" } });
    expect(await submitEvents("s1", [{ type: "ClaimRemoved", claimId: "c1" }])).toEqual({
      ok: false,
      error: { code: "CLAIM_NOT_FOUND", message: "No claim c1" },
    });
  });
});
