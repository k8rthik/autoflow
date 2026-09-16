import { sequentialIds, type ClaimExtractor } from "@autoflow/classifier";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { titleOf } from "../src/samples.ts";

const meta = { model: "fake-model", inputTokens: 1, outputTokens: 1, latencyMs: 5, stopReason: "end_turn" };
const okExtractor: ClaimExtractor = {
  extractClaims: async () => ({ ok: true, claims: [{ topic: "Market", text: "Market is large", excerpt: "x", evidence: [] }], meta }),
};
const samples = async () => [{ id: "a", title: "Memo A", text: "# Memo A\n\nbody" }];

const app = (extractor = okExtractor) => createApp({ extractor, model: "fake-model", samples, makeId: sequentialIds("c") });

const post = (a: ReturnType<typeof createApp>, body: unknown) =>
  a.request("/api/memo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("POST /api/memo", () => {
  it("returns a title and ClaimAdded events in the response envelope", async () => {
    const res = await post(app(), { memo: "# Larkspur\n\nThe market is large." });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      error: null,
      data: {
        title: "Larkspur",
        model: "fake-model",
        latencyMs: 5,
        events: [{ type: "ClaimAdded", claim: { id: "c1", text: "Market is large", order: 0, topic: "Market" } }],
      },
    });
  });

  it("rejects a missing or empty memo with 400", async () => {
    expect((await post(app(), { memo: "   " })).status).toBe(400);
    expect((await post(app(), {})).status).toBe(400);
    const res = await app().request("/api/memo", { method: "POST", body: "not json" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
  });

  it("maps upstream extraction failures to 502 with the error passed through", async () => {
    const failing: ClaimExtractor = { extractClaims: async () => ({ ok: false, error: { code: "REFUSED", message: "no" } }) };
    const res = await post(app(failing), { memo: "text" });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, data: null, error: { code: "REFUSED", message: "no" } });
  });

  it("returns 500 in the envelope when the extractor throws", async () => {
    const throwing: ClaimExtractor = { extractClaims: async () => { throw new Error("boom"); } };
    const res = await post(app(throwing), { memo: "text" });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
  });
});

describe("POST /api/memo/parse", () => {
  const upload = (name: string, content: string, type = "text/markdown") => {
    const form = new FormData();
    form.append("file", new File([content], name, { type }));
    return app().request("/api/memo/parse", { method: "POST", body: form });
  };

  it("turns an uploaded markdown file into a MemoDocument", async () => {
    const res = await upload("Quill Memo.md", "# Quill\n\nRenters build credit.");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      error: null,
      data: { title: "Quill", markdown: "# Quill\n\nRenters build credit.", figures: [] },
    });
  });

  it("rejects unsupported types and missing files with 400", async () => {
    expect((await upload("deck.pdf", "x", "application/pdf")).status).toBe(400);
    const res = await app().request("/api/memo/parse", { method: "POST", body: new FormData() });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
  });

  it("passes figures through to the extractor when building", async () => {
    let received: unknown = null;
    const spy: ClaimExtractor = {
      extractClaims: async (memo) => {
        received = memo;
        return { ok: true, claims: [{ topic: "T", text: "c", excerpt: "Figure 1", evidence: [] }], meta };
      },
    };
    const figure = { index: 1, mediaType: "image/png", data: "QUJD" };
    const res = await post(app(spy), { memo: "text\n![Figure 1](figure:1)", figures: [figure] });
    expect(res.status).toBe(200);
    expect(received).toEqual({ markdown: "text\n![Figure 1](figure:1)", figures: [figure] });
  });

  it("rejects a malformed figure", async () => {
    const res = await post(app(), { memo: "text", figures: [{ index: 0, mediaType: "image/bmp", data: "" }] });
    expect(res.status).toBe(400);
  });
});

describe("samples", () => {
  it("lists samples without their text and serves one by id", async () => {
    const list = await (await app().request("/api/samples")).json();
    expect(list).toEqual({ ok: true, error: null, data: { samples: [{ id: "a", title: "Memo A" }] } });
    const one = await (await app().request("/api/samples/a")).json();
    expect(one).toMatchObject({ ok: true, data: { id: "a", text: "# Memo A\n\nbody" } });
    expect((await app().request("/api/samples/nope")).status).toBe(404);
  });

  it("titleOf takes the first heading and falls back otherwise", () => {
    expect(titleOf("intro\n# Investment Memo: X — Series A\n## Sub", "f")).toBe("Investment Memo: X — Series A");
    expect(titleOf("no headings", "fallback")).toBe("fallback");
  });
});
