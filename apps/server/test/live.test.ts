import { sequentialIds, type ClaimExtractor } from "@autoflow/classifier";
import type { FlowEvent, RecordedEvent } from "@autoflow/core";
import { createMemoryEventStore } from "@autoflow/storage";
import type { Transcriber } from "@autoflow/transcription";
import { serve, type ServerType } from "@hono/node-server";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createApp } from "../src/app.ts";
import { createSessionHub, type SessionHub } from "../src/hub.ts";
import { attachLiveUpdates, routeFromPath } from "../src/live.ts";

const meta = { model: "fake", inputTokens: 1, outputTokens: 1, latencyMs: 1, stopReason: "end_turn" };
const extractor: ClaimExtractor = {
  extractClaims: async () => ({ ok: true, claims: [{ topic: "Market", text: "Market is large", excerpt: "x", evidence: [] }], meta }),
};

interface Running {
  readonly port: number;
  readonly hub: SessionHub;
  readonly server: ServerType;
}

const running: Running[] = [];
const sockets: WebSocket[] = [];

const start = async (transcriber: Transcriber | null = null): Promise<Running> => {
  let n = 0;
  const hub = createSessionHub({ store: createMemoryEventStore(), makeId: () => `s${++n}` });
  const app = createApp({ extractor, model: "fake", samples: async () => [], hub, makeId: sequentialIds("c") });
  const server = serve({ fetch: app.fetch, port: 0 });
  attachLiveUpdates(server, { hub, transcriber });

  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (typeof address === "string" || address === null) throw new Error("Expected a TCP address");

  const instance = { port: address.port, hub, server };
  running.push(instance);
  return instance;
};

const connect = (port: number, path: string): WebSocket => {
  const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  sockets.push(socket);
  return socket;
};

/** Resolves with the next message, or rejects if the socket closes first. */
const nextMessage = (socket: WebSocket): Promise<Record<string, unknown>> =>
  new Promise((resolve, reject) => {
    socket.once("message", (raw) => resolve(JSON.parse(String(raw)) as Record<string, unknown>));
    socket.once("close", (code) => reject(new Error(`Socket closed with ${code}`)));
  });

const nextClose = (socket: WebSocket): Promise<number> =>
  new Promise((resolve) => socket.once("close", (code) => resolve(code)));

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.close();
  await Promise.all(
    running.splice(0).map((instance) => new Promise<void>((resolve) => instance.server.close(() => resolve()))),
  );
});

const seedSession = async (hub: SessionHub) => {
  const created = await hub.create({
    title: "Larkspur",
    events: [{ type: "ClaimAdded", claim: { id: "c1", text: "The market is large", order: 0 } }],
  });
  if (!created.ok) throw new Error("Could not seed the session");
  return created.value.session.id;
};

const rename: FlowEvent = { type: "ClaimRenamed", claimId: "c1", text: "The market is crowded" };

describe("routeFromPath", () => {
  it("reads the session id out of the live-updates path", () => {
    expect(routeFromPath("/ws/sessions/abc-123")).toEqual({ kind: "watch", sessionId: "abc-123" });
    expect(routeFromPath("/ws/sessions/abc-123?since=4")).toEqual({ kind: "watch", sessionId: "abc-123" });
  });

  it("reads the session id out of the audio path", () => {
    expect(routeFromPath("/ws/sessions/abc-123/audio")).toEqual({ kind: "audio", sessionId: "abc-123" });
  });

  it("refuses anything else, including a path trying to escape the route", () => {
    expect(routeFromPath("/ws/sessions/")).toBeNull();
    expect(routeFromPath("/ws/sessions/a/b")).toBeNull();
    expect(routeFromPath("/ws/sessions/a/audio/b")).toBeNull();
    expect(routeFromPath("/ws/sessions//audio")).toBeNull();
    expect(routeFromPath("/ws/sessions/../../etc/passwd")).toBeNull();
    expect(routeFromPath("/socket")).toBeNull();
    expect(routeFromPath(undefined)).toBeNull();
  });
});

describe("live updates", () => {
  it("greets a client with the sequence its live stream starts from", async () => {
    const { port, hub } = await start();
    const id = await seedSession(hub);

    const socket = connect(port, `/ws/sessions/${id}`);
    expect(await nextMessage(socket)).toEqual({ type: "welcome", afterSeq: 1 });
  });

  it("pushes events committed by someone else to every connected client", async () => {
    const { port, hub } = await start();
    const id = await seedSession(hub);

    const first = connect(port, `/ws/sessions/${id}`);
    const second = connect(port, `/ws/sessions/${id}`);
    await Promise.all([nextMessage(first), nextMessage(second)]);

    const pushed = Promise.all([nextMessage(first), nextMessage(second)]);
    await hub.submit({ sessionId: id, events: [rename], actor: "participant" });

    for (const message of await pushed) {
      expect(message["type"]).toBe("events");
      expect((message["events"] as RecordedEvent[])[0]).toMatchObject({ seq: 2, event: rename });
    }
  });

  it("carries a correction made over HTTP to a listening client", async () => {
    const { port, hub } = await start();
    const id = await seedSession(hub);

    const socket = connect(port, `/ws/sessions/${id}`);
    await nextMessage(socket);
    const pushed = nextMessage(socket);

    const response = await fetch(`http://127.0.0.1:${port}/api/sessions/${id}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events: [rename] }),
    });

    expect(response.status).toBe(200);
    const message = await pushed;
    expect((message["events"] as RecordedEvent[])[0]).toMatchObject({ seq: 2, event: rename });
  });

  it("turns away a connection to a session that does not exist", async () => {
    const { port } = await start();
    const socket = connect(port, "/ws/sessions/ghost");
    expect(await nextClose(socket)).toBe(4004);
  });

  it("turns away a missing session whose id is too long to quote in a close reason, and keeps serving", async () => {
    const { port, hub } = await start();
    const socket = connect(port, `/ws/sessions/${"a".repeat(200)}`);
    expect(await nextClose(socket)).toBe(4004);

    const id = await seedSession(hub);
    expect(await nextMessage(connect(port, `/ws/sessions/${id}`))).toEqual({ type: "welcome", afterSeq: 1 });
  });

  it("turns away a connection to a path that is not a session", async () => {
    const { port } = await start();
    const socket = connect(port, "/socket");
    expect(await nextClose(socket)).toBe(4004);
  });

  it("stops pushing to a client that has gone away", async () => {
    const { port, hub } = await start();
    const id = await seedSession(hub);

    const staying = connect(port, `/ws/sessions/${id}`);
    const leaving = connect(port, `/ws/sessions/${id}`);
    await Promise.all([nextMessage(staying), nextMessage(leaving)]);

    leaving.close();
    await nextClose(leaving);

    const pushed = nextMessage(staying);
    const submitted = await hub.submit({ sessionId: id, events: [rename], actor: "participant" });

    expect(submitted.ok).toBe(true);
    expect((await pushed)["type"]).toBe("events");
  });

  it("does not leak one room's events into another", async () => {
    const { port, hub } = await start();
    const watched = await seedSession(hub);
    const other = await hub.create({ title: "Quill", events: [] });
    expect(other.ok).toBe(true);
    if (!other.ok) return;

    const socket = connect(port, `/ws/sessions/${other.value.session.id}`);
    await nextMessage(socket);

    const received: unknown[] = [];
    socket.on("message", (raw) => received.push(JSON.parse(String(raw))));
    await hub.submit({ sessionId: watched, events: [rename], actor: "participant" });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(received).toEqual([]);
  });
});
