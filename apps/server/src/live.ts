import type { ServerType } from "@hono/node-server";
import type { Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { HubMessage, SessionHub } from "./hub.ts";

const SESSION_PATH = /^\/ws\/sessions\/([A-Za-z0-9_-]{1,200})$/;

/** Pulled out so the close codes are named rather than scattered as magic numbers. */
const CLOSE_NO_SESSION = 4004;

export const sessionIdFromPath = (url: string | undefined): string | null => {
  if (!url) return null;
  const path = url.split("?")[0] ?? "";
  return SESSION_PATH.exec(path)?.[1] ?? null;
};

const send = (socket: WebSocket, message: HubMessage | { type: "welcome"; afterSeq: number }): void => {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
};

/**
 * Live updates are one-directional: the server pushes committed events, and clients write through
 * the HTTP API. Corrections are rare enough that a request/response round trip is the simpler
 * contract, and it keeps the only write path — where validation lives — in one place.
 */
export const attachLiveUpdates = (server: ServerType, hub: SessionHub): WebSocketServer => {
  // `serve()` is typed as possibly an HTTP/2 server; we never configure one, and `ws` needs http.Server.
  const wss = new WebSocketServer({ server: server as Server });

  wss.on("connection", async (socket, request) => {
    const sessionId = sessionIdFromPath(request.url);
    if (!sessionId) return socket.close(CLOSE_NO_SESSION, "Connect to /ws/sessions/:id");

    const snapshot = await hub.snapshot(sessionId);
    if (!snapshot.ok) return socket.close(CLOSE_NO_SESSION, snapshot.error.message);

    // The client already fetched the log over HTTP; this says where the live stream starts so it
    // can tell whether it missed anything between that fetch and this connection.
    send(socket, { type: "welcome", afterSeq: snapshot.value.events.at(-1)?.seq ?? 0 });

    const unsubscribe = hub.subscribe(sessionId, (message) => send(socket, message));
    socket.on("close", unsubscribe);
    socket.on("error", unsubscribe);
  });

  return wss;
};
