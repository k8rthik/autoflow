import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFlow, fetchSample, listSamples, parseEnvelope, parseMemoFile } from "../src/lib/api.ts";

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

  it("posts the memo and its figures as JSON and unwraps the flow", async () => {
    const data = { title: "Larkspur", events: [], model: "fake", latencyMs: 3 };
    respondWith({ ok: true, data, error: null });
    const figures = [{ index: 1, mediaType: "image/png" as const, data: "QUJD" }];

    expect(await buildFlow("a memo", figures)).toEqual({ ok: true, value: data });
    const [path, init] = lastCall();
    expect(path).toBe("/api/memo");
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
    expect(await buildFlow("a memo")).toEqual({
      ok: false,
      error: { code: "NETWORK", message: "Could not reach the server. Is it running?" },
    });
  });

  it("treats an unparseable body as a malformed response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => { throw new SyntaxError("bad json"); } } as unknown as Response));
    expect(await buildFlow("a memo")).toMatchObject({ ok: false, error: { code: "NETWORK" } });
  });

  it("passes a server error through to the caller", async () => {
    respondWith({ ok: false, data: null, error: { code: "REFUSED", message: "The model refused" } });
    expect(await buildFlow("a memo")).toEqual({ ok: false, error: { code: "REFUSED", message: "The model refused" } });
  });

  it("flags a success envelope whose payload is the wrong shape", async () => {
    respondWith({ ok: true, data: { title: "Larkspur" }, error: null });
    expect(await buildFlow("a memo")).toMatchObject({ ok: false, error: { code: "MALFORMED" } });
  });
});
