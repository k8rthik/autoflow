import type { TranscriptSegment } from "@autoflow/core";
import type { IncomingMessage } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";
import { createDeepgramTranscriber } from "../src/deepgram.ts";
import type { TranscriptionError } from "../src/types.ts";
import { results } from "./fake-socket.ts";

interface FakeServer {
  readonly url: string;
  readonly upgrades: IncomingMessage[];
  readonly audio: Buffer[];
  readonly control: unknown[];
}

const servers: WebSocketServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((wss) => new Promise<void>((resolve) => wss.close(() => resolve()))));
});

/**
 * A local stand-in for Deepgram's listen endpoint, spoken to over a real WebSocket. On CloseStream
 * it flushes one final result and closes, as Deepgram does.
 */
const fakeDeepgramServer = async (onConnection?: (socket: WebSocket) => void): Promise<FakeServer> => {
  const upgrades: IncomingMessage[] = [];
  const audio: Buffer[] = [];
  const control: unknown[] = [];
  const wss = new WebSocketServer({
    port: 0,
    verifyClient: ({ req }, done) => done(req.headers.authorization === "Token dg-test-key", 401, "Unauthorized"),
  });
  servers.push(wss);

  wss.on("connection", (socket, request) => {
    upgrades.push(request);
    onConnection?.(socket);
    socket.on("message", (data, isBinary) => {
      if (isBinary) return void audio.push(data as Buffer);
      const message = JSON.parse(String(data)) as { type: string };
      control.push(message);
      if (message.type === "CloseStream") {
        socket.send(results({ start: 0, duration: 1.5, isFinal: true, transcript: "Burn is fine." }));
        socket.close(1000);
      }
    });
  });

  await new Promise((resolve) => wss.once("listening", resolve));
  const { port } = wss.address() as { port: number };
  return { url: `ws://127.0.0.1:${port}/v1/listen`, upgrades, audio, control };
};

const collect = () => {
  const segments: TranscriptSegment[] = [];
  const errors: TranscriptionError[] = [];
  return { segments, errors, handlers: { onSegment: (s: TranscriptSegment) => segments.push(s), onError: (e: TranscriptionError) => errors.push(e) } };
};

describe("Deepgram adapter over a real WebSocket", () => {
  it("authenticates with a Token header, streams the audio as binary, and returns what the server flushes on close", async () => {
    const server = await fakeDeepgramServer((socket) =>
      socket.send(results({ start: 0, duration: 0.5, isFinal: false, transcript: "burn" })),
    );
    const transcriber = createDeepgramTranscriber({ apiKey: "dg-test-key", baseUrl: server.url, makeId: () => "mic" });
    const { segments, errors, handlers } = collect();

    const stream = transcriber.open(handlers, { vocabulary: ["Larkspur"] });
    stream.send(Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3]));
    stream.send(Uint8Array.from([1, 2, 3]));
    await stream.close();

    expect(server.upgrades[0]?.url).toBe("/v1/listen?model=nova-3&interim_results=true&smart_format=true&keyterm=Larkspur");
    expect(Buffer.concat(server.audio)).toEqual(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]));
    expect(server.control).toEqual([{ type: "CloseStream" }]);
    expect(segments).toEqual([
      { id: "mic:0", text: "burn", startMs: 0, endMs: 500, final: false, confidence: 0.9 },
      { id: "mic:0", text: "Burn is fine.", startMs: 0, endMs: 1500, final: true, confidence: 0.9 },
    ]);
    expect(errors).toEqual([]);
  });

  it("reports a rejected key as a connection failure", async () => {
    const server = await fakeDeepgramServer();
    const transcriber = createDeepgramTranscriber({ apiKey: "wrong-key", baseUrl: server.url });
    const { errors, handlers } = collect();

    const stream = transcriber.open(handlers);
    await stream.close();

    expect(errors).toHaveLength(1);
    expect(errors[0]?.code).toBe("CONNECTION_FAILED");
    expect(errors[0]?.message).toMatch(/401/);
    expect(server.upgrades).toEqual([]);
  });
});
