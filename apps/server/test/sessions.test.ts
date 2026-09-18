import { sequentialIds, type ClaimExtractor } from "@autoflow/classifier";
import type { FlowEvent } from "@autoflow/core";
import { createMemoryEventStore } from "@autoflow/storage";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { createSessionHub } from "../src/hub.ts";

const meta = { model: "fake-model", inputTokens: 1, outputTokens: 1, latencyMs: 5, stopReason: "end_turn" };
const okExtractor: ClaimExtractor = {
  extractClaims: async () => ({
    ok: true,
    claims: [{ topic: "Market", text: "Market is large", excerpt: "x", evidence: [] }],
    meta,
  }),
};
const samples = async () => [{ id: "a", title: "Memo A", text: "# Memo A\n\nbody" }];

let app: ReturnType<typeof createApp>;

const makeApp = (extractor = okExtractor) => {
  let n = 0;
  const hub = createSessionHub({ store: createMemoryEventStore(), makeId: () => `s${++n}` });
  return createApp({ extractor, model: "fake-model", samples, hub, makeId: sequentialIds("c") });
};

beforeEach(() => {
  app = makeApp();
});

const postJson = (path: string, body: unknown) =>
  app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const startSession = async (memo = "# Larkspur\n\nThe market is large.") => {
  const res = await postJson("/api/sessions", { memo });
  const body = (await res.json()) as { data: { session: { id: string }; events: unknown[] } };
  return body.data;
};

describe("POST /api/sessions", () => {
  it("extracts the memo, persists the seeded log and returns the session", async () => {
    const res = await postJson("/api/sessions", { memo: "# Larkspur\n\nThe market is large." });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      ok: true,
      error: null,
      data: {
        session: { id: "s1", title: "Larkspur", createdAt: expect.any(String) },
        events: [
          {
            seq: 1,
            at: expect.any(String),
            actor: "import",
            event: { type: "ClaimAdded", claim: { id: "c1", text: "Market is large", order: 0, topic: "Market" } },
          },
        ],
        model: "fake-model",
        latencyMs: 5,
      },
    });
  });

  it("rejects a missing or oversized memo with 400", async () => {
    expect((await postJson("/api/sessions", { memo: "  " })).status).toBe(400);
    expect((await postJson("/api/sessions", {})).status).toBe(400);
  });

  it("maps upstream extraction failures to 502 without creating a session", async () => {
    const failing: ClaimExtractor = { extractClaims: async () => ({ ok: false, error: { code: "REFUSED", message: "no" } }) };
    app = makeApp(failing);
    expect((await postJson("/api/sessions", { memo: "text" })).status).toBe(502);

    const list = await (await app.request("/api/sessions")).json();
    expect(list).toMatchObject({ data: { sessions: [] } });
  });
});

describe("GET /api/sessions", () => {
  it("lists sessions newest first", async () => {
    await startSession();
    await startSession();
    const body = await (await app.request("/api/sessions")).json();
    expect(body).toMatchObject({ ok: true, data: { sessions: [{ id: "s2" }, { id: "s1" }] } });
  });

  it("returns a session with its whole log", async () => {
    const { session } = await startSession();
    const res = await app.request(`/api/sessions/${session.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { events: unknown[] } };
    expect(body.data.events).toHaveLength(1);
  });

  it("404s a session that is not there", async () => {
    const res = await app.request("/api/sessions/ghost");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "SESSION_NOT_FOUND" } });
  });
});

describe("POST /api/sessions/:id/events", () => {
  const rename: FlowEvent = { type: "ClaimRenamed", claimId: "c1", text: "The market is crowded" };

  it("appends a correction and returns it with its sequence", async () => {
    const { session } = await startSession();
    const res = await postJson(`/api/sessions/${session.id}/events`, { events: [rename] });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, data: { events: [{ seq: 2, actor: "participant", event: rename }] } });
  });

  it("refuses an event the domain rejects with 409, leaving the log alone", async () => {
    const { session } = await startSession();
    const res = await postJson(`/api/sessions/${session.id}/events`, {
      events: [{ type: "ClaimRenamed", claimId: "ghost", text: "x" }],
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "CLAIM_NOT_FOUND" } });

    const after = (await (await app.request(`/api/sessions/${session.id}`)).json()) as { data: { events: unknown[] } };
    expect(after.data.events).toHaveLength(1);
  });

  it("rejects anything that is not a known event shape, before the domain sees it", async () => {
    const { session } = await startSession();
    const cases = [
      { events: [{ type: "NotAnEvent", claimId: "c1" }] },
      { events: [{ type: "ClaimRenamed", claimId: "c1" }] },
      { events: [{ type: "ClaimAdded", claim: { id: "c9", text: "x" } }] },
      { events: [{ type: "ArgumentAdded", argument: { id: "a1", claimId: "c1", text: "t", stance: "sideways", respondsTo: null, source: "manual", sourceRefs: [] } }] },
      { events: "not an array" },
      {},
    ];

    for (const body of cases) {
      const res = await postJson(`/api/sessions/${session.id}/events`, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("404s events submitted to a session that is not there", async () => {
    const res = await postJson("/api/sessions/ghost/events", { events: [rename] });
    expect(res.status).toBe(404);
  });

  it("accepts a batch and numbers it in order", async () => {
    const { session } = await startSession();
    const res = await postJson(`/api/sessions/${session.id}/events`, {
      events: [
        { type: "ClaimAdded", claim: { id: "c2", text: "The team is strong", order: 1 } },
        { type: "ArgumentAdded", argument: { id: "a1", claimId: "c2", text: "No prior exits", stance: "attack", respondsTo: null, source: "manual", sourceRefs: [] } },
      ],
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { events: { seq: number }[] } };
    expect(body.data.events.map((e) => e.seq)).toEqual([2, 3]);
  });
});
