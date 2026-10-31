import type { TranscriptSegment } from "@autoflow/core";
import { createMemoryEventStore, type EventStore } from "@autoflow/storage";
import { createDeepgramTranscriber, type Transcriber, type TranscriptionHandlers } from "@autoflow/transcription";
import { serve, type ServerType } from "@hono/node-server";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { createApp } from "../src/app.ts";
import { createSessionHub, type SessionHub } from "../src/hub.ts";
import { attachLiveUpdates } from "../src/live.ts";

interface FakeStream {
  readonly handlers: TranscriptionHandlers;
  readonly audio: Buffer[];
  closed: boolean;
}

/** A transcriber the test drives: it records the audio it is sent and emits whatever the test says it heard. */
const fakeTranscriber = (): { readonly transcriber: Transcriber; readonly streams: FakeStream[] } => {
  const streams: FakeStream[] = [];
  return {
    streams,
    transcriber: {
      open: (handlers) => {
        const stream: FakeStream = { handlers, audio: [], closed: false };
        streams.push(stream);
        return {
          send: (audio) => void stream.audio.push(Buffer.from(audio)),
          close: async () => {
            stream.closed = true;
          },
        };
      },
    },
  };
};

const closers: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

const closeServer = (server: ServerType | WebSocketServer) => () => new Promise<void>((resolve) => server.close(() => resolve()));

/** `lookupDelayMs` holds every session lookup, so frames can arrive while the server is still checking the session. */
const start = async (
  transcriber: Transcriber | null,
  lookupDelayMs = 0,
): Promise<{ port: number; hub: SessionHub; sessionId: string }> => {
  let n = 0;
  const memory = createMemoryEventStore();
  const store: EventStore = {
    ...memory,
    getSession: async (id) => {
      await new Promise((resolve) => setTimeout(resolve, lookupDelayMs));
      return memory.getSession(id);
    },
  };
  const hub = createSessionHub({ store, makeId: () => `s${++n}` });
  const extractor = { extractClaims: async () => ({ ok: false as const, error: { code: "API_ERROR" as const, message: "unused" } }) };
  const app = createApp({ extractor, model: "fake", samples: async () => [], hub });
  const server = serve({ fetch: app.fetch, port: 0 });
  attachLiveUpdates(server, { hub, transcriber });
  closers.push(closeServer(server));
  await new Promise((resolve) => server.once("listening", resolve));

  const created = await hub.create({ title: "Larkspur", events: [] });
  if (!created.ok) throw new Error("Could not seed the session");
  return { port: (server.address() as { port: number }).port, hub, sessionId: created.value.session.id };
};

const connect = (port: number, path: string): WebSocket => {
  const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  closers.push(async () => socket.close());
  return socket;
};

const opened = (socket: WebSocket): Promise<void> => new Promise((resolve) => socket.once("open", () => resolve()));
const nextClose = (socket: WebSocket): Promise<{ code: number; reason: string }> =>
  new Promise((resolve) => socket.once("close", (code, reason) => resolve({ code, reason: reason.toString() })));

/** Collects the transcript messages a watcher receives, after its welcome. */
const watchTranscript = async (port: number, sessionId: string): Promise<TranscriptSegment[]> => {
  const watcher = connect(port, `/ws/sessions/${sessionId}`);
  const segments: TranscriptSegment[] = [];
  await new Promise<void>((resolve) => {
    watcher.on("message", (raw) => {
      const message = JSON.parse(String(raw)) as { type: string; segment?: TranscriptSegment };
      if (message.type === "welcome") resolve();
      if (message.type === "transcript" && message.segment) segments.push(message.segment);
    });
  });
  return segments;
};

const until = async (condition: () => boolean): Promise<void> => {
  for (let i = 0; i < 100 && !condition(); i++) await new Promise((resolve) => setTimeout(resolve, 10));
  expect(condition()).toBe(true);
};

const segment = (text: string, final: boolean): TranscriptSegment => ({ id: "mic:0", text, startMs: 0, endMs: 900, final, confidence: 0.9 });

describe("streaming audio into a room", () => {
  it("relays audio sent while the session is still being looked up, in order, to one transcription stream", async () => {
    const fake = fakeTranscriber();
    const { port, sessionId } = await start(fake.transcriber, 100);

    const mic = connect(port, `/ws/sessions/${sessionId}/audio`);
    await opened(mic);
    mic.send(Buffer.from([0x1a, 0x45]));
    mic.send(Buffer.from([1, 2]));
    mic.send(Buffer.from([3]));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fake.streams).toEqual([]);

    await until(() => fake.streams[0]?.audio.length === 3);
    expect(fake.streams).toHaveLength(1);
    expect(Buffer.concat(fake.streams[0]!.audio)).toEqual(Buffer.from([0x1a, 0x45, 1, 2, 3]));
  });

  it("pushes what the transcriber hears to everyone watching that room, and nobody else", async () => {
    const fake = fakeTranscriber();
    const { port, hub, sessionId } = await start(fake.transcriber);
    const other = await hub.create({ title: "Quill", events: [] });
    if (!other.ok) throw new Error("Could not seed the second session");

    const watching = await watchTranscript(port, sessionId);
    const elsewhere = await watchTranscript(port, other.value.session.id);
    const mic = connect(port, `/ws/sessions/${sessionId}/audio`);
    await opened(mic);
    mic.send(Buffer.from([1]));
    await until(() => fake.streams.length === 1);

    fake.streams[0]!.handlers.onSegment(segment("the burn", false));
    fake.streams[0]!.handlers.onSegment(segment("The burn is fine.", true));

    await until(() => watching.length === 2);
    expect(watching).toEqual([segment("the burn", false), segment("The burn is fine.", true)]);
    expect(elsewhere).toEqual([]);
  });

  it("closes the transcription stream when the microphone disconnects", async () => {
    const fake = fakeTranscriber();
    const { port, sessionId } = await start(fake.transcriber);

    const mic = connect(port, `/ws/sessions/${sessionId}/audio`);
    await opened(mic);
    mic.send(Buffer.from([1]));
    await until(() => fake.streams.length === 1);
    mic.close();

    await until(() => fake.streams[0]?.closed === true);
  });

  it("tells the microphone why when transcription fails, even with a long provider message", async () => {
    const fake = fakeTranscriber();
    const { port, sessionId } = await start(fake.transcriber);

    const mic = connect(port, `/ws/sessions/${sessionId}/audio`);
    await opened(mic);
    mic.send(Buffer.from([1]));
    await until(() => fake.streams.length === 1);
    const closed = nextClose(mic);
    fake.streams[0]!.handlers.onError({ code: "CLOSED_UNEXPECTEDLY", message: `Deepgram closed the stream (1011: ${"x".repeat(300)})` });

    const { code, reason } = await closed;
    expect(code).toBe(1011);
    expect(reason.startsWith("Deepgram closed the stream (1011: ")).toBe(true);
    expect(Buffer.byteLength(reason)).toBeLessThanOrEqual(123);
  });

  it("turns away audio for a session that does not exist, without opening a stream", async () => {
    const fake = fakeTranscriber();
    const { port } = await start(fake.transcriber);

    const mic = connect(port, "/ws/sessions/ghost/audio");
    expect((await nextClose(mic)).code).toBe(4004);
    expect(fake.streams).toEqual([]);
  });

  it("turns away audio when no transcriber is configured", async () => {
    const { port, sessionId } = await start(null);
    const mic = connect(port, `/ws/sessions/${sessionId}/audio`);
    expect(await nextClose(mic)).toEqual({ code: 4503, reason: "Live transcription is not configured on this server" });
  });

  it("refuses text frames on the audio socket", async () => {
    const fake = fakeTranscriber();
    const { port, sessionId } = await start(fake.transcriber);

    const mic = connect(port, `/ws/sessions/${sessionId}/audio`);
    await opened(mic);
    const closed = nextClose(mic);
    mic.send("hello");
    expect((await closed).code).toBe(1003);
  });
});

describe("streaming audio through the Deepgram adapter", () => {
  it("carries a microphone's audio to Deepgram and Deepgram's transcript back to the room", async () => {
    const received: Buffer[] = [];
    const deepgram = new WebSocketServer({ port: 0 });
    closers.push(closeServer(deepgram));
    deepgram.on("connection", (socket) => {
      socket.on("message", (data, isBinary) => {
        if (isBinary) {
          received.push(data as Buffer);
          socket.send(JSON.stringify({ type: "Results", start: 0, duration: 0.6, is_final: false, channel: { alternatives: [{ transcript: "burn", confidence: 0.8 }] } }));
          return;
        }
        if ((JSON.parse(String(data)) as { type: string }).type === "CloseStream") {
          socket.send(JSON.stringify({ type: "Results", start: 0, duration: 1.2, is_final: true, channel: { alternatives: [{ transcript: "Burn is fine.", confidence: 0.95 }] } }));
          socket.close(1000);
        }
      });
    });
    await new Promise((resolve) => deepgram.once("listening", resolve));
    const transcriber = createDeepgramTranscriber({
      apiKey: "dg-test-key",
      baseUrl: `ws://127.0.0.1:${(deepgram.address() as { port: number }).port}/v1/listen`,
      makeId: () => "mic",
    });
    const { port, sessionId } = await start(transcriber);

    const watching = await watchTranscript(port, sessionId);
    const mic = connect(port, `/ws/sessions/${sessionId}/audio`);
    await opened(mic);
    mic.send(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    await until(() => watching.length === 1);
    mic.close();

    await until(() => watching.length === 2);
    expect(Buffer.concat(received)).toEqual(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    expect(watching).toEqual([
      { id: "mic:0", text: "burn", startMs: 0, endMs: 600, final: false, confidence: 0.8 },
      { id: "mic:0", text: "Burn is fine.", startMs: 0, endMs: 1200, final: true, confidence: 0.95 },
    ]);
  });
});
