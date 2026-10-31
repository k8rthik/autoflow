import type { ServerType } from "@hono/node-server";
import type { Transcriber, TranscriptionStream } from "@autoflow/transcription";
import type { Server } from "node:http";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import type { HubMessage, SessionHub } from "./hub.ts";

const LIVE_PATH = /^\/ws\/sessions\/([A-Za-z0-9_-]{1,200})(\/audio)?$/;

/** Pulled out so the close codes are named rather than scattered as magic numbers. */
const CLOSE_NO_SESSION = 4004;
const CLOSE_NO_TRANSCRIBER = 4503;
const CLOSE_TRANSCRIPTION_FAILED = 1011;
const CLOSE_UNSUPPORTED_DATA = 1003;

/** The WebSocket protocol caps a close reason at 123 bytes, and `ws` throws rather than truncating. */
const MAX_CLOSE_REASON_BYTES = 123;

/** `watch` receives the room's events and transcript; `audio` sends the room's microphone in. */
export type LiveRoute = { readonly kind: "watch" | "audio"; readonly sessionId: string };

export const routeFromPath = (url: string | undefined): LiveRoute | null => {
  if (!url) return null;
  const path = url.split("?")[0] ?? "";
  const match = LIVE_PATH.exec(path);
  if (!match?.[1]) return null;
  return { kind: match[2] ? "audio" : "watch", sessionId: match[1] };
};

export interface LiveDeps {
  readonly hub: SessionHub;
  /** Null when no transcription provider is configured; audio connections are then turned away. */
  readonly transcriber: Transcriber | null;
}

const send = (socket: WebSocket, message: HubMessage | { type: "welcome"; afterSeq: number }): void => {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
};

const closeWith = (socket: WebSocket, code: number, reason: string): void => {
  let fitted = "";
  for (const char of reason) {
    if (Buffer.byteLength(fitted + char) > MAX_CLOSE_REASON_BYTES) break;
    fitted += char;
  }
  socket.close(code, fitted);
};

const toBytes = (data: RawData): Uint8Array => {
  if (Array.isArray(data)) return Buffer.concat(data);
  return data instanceof ArrayBuffer ? new Uint8Array(data) : data;
};

const watch = async (socket: WebSocket, hub: SessionHub, sessionId: string): Promise<void> => {
  const snapshot = await hub.snapshot(sessionId);
  if (!snapshot.ok) return socket.close(CLOSE_NO_SESSION, snapshot.error.message);

  // The client already fetched the log over HTTP; this says where the live stream starts so it
  // can tell whether it missed anything between that fetch and this connection.
  send(socket, { type: "welcome", afterSeq: snapshot.value.events.at(-1)?.seq ?? 0 });

  const unsubscribe = hub.subscribe(sessionId, (message) => send(socket, message));
  socket.on("close", unsubscribe);
  socket.on("error", unsubscribe);
};

/**
 * One microphone's audio for a session, as binary frames, relayed to the transcriber; what it
 * hears is published to everyone watching the room. Listeners are attached before the session
 * lookup resolves, and every frame waits on that one lookup, so audio sent straight after the
 * socket opens is relayed in order instead of being lost.
 */
const listen = (socket: WebSocket, hub: SessionHub, transcriber: Transcriber | null, sessionId: string): void => {
  if (!transcriber) return closeWith(socket, CLOSE_NO_TRANSCRIBER, "Live transcription is not configured on this server");

  const stream: Promise<TranscriptionStream | null> = hub.snapshot(sessionId).then((snapshot) => {
    if (!snapshot.ok) {
      closeWith(socket, CLOSE_NO_SESSION, snapshot.error.message);
      return null;
    }
    return transcriber.open({
      onSegment: (segment) => hub.publishTranscript(sessionId, segment),
      onError: (error) => closeWith(socket, CLOSE_TRANSCRIPTION_FAILED, error.message),
    });
  });

  socket.on("message", (data, isBinary) => {
    if (!isBinary) return closeWith(socket, CLOSE_UNSUPPORTED_DATA, "Send audio as binary frames");
    void stream.then((open) => open?.send(toBytes(data)));
  });
  socket.on("close", () => void stream.then((open) => open?.close()));
};

/**
 * Live updates to watchers are one-directional: the server pushes committed events and transcript,
 * and clients write corrections through the HTTP API. Corrections are rare enough that a
 * request/response round trip is the simpler contract, and it keeps the only write path to the log,
 * where validation lives, in one place. Audio is the exception, on its own path, because it is a
 * continuous stream rather than a write to the log.
 */
export const attachLiveUpdates = (server: ServerType, { hub, transcriber }: LiveDeps): WebSocketServer => {
  // `serve()` is typed as possibly an HTTP/2 server; we never configure one, and `ws` needs http.Server.
  const wss = new WebSocketServer({ server: server as Server });

  wss.on("connection", (socket, request) => {
    const route = routeFromPath(request.url);
    if (!route) return socket.close(CLOSE_NO_SESSION, "Connect to /ws/sessions/:id or /ws/sessions/:id/audio");
    if (route.kind === "audio") return listen(socket, hub, transcriber, route.sessionId);
    void watch(socket, hub, route.sessionId);
  });

  return wss;
};
