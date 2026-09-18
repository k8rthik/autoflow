import type { RecordedEvent } from "@autoflow/core";

export type LiveMessage =
  | { readonly type: "welcome"; readonly afterSeq: number }
  | { readonly type: "events"; readonly events: readonly RecordedEvent[] };

const isLiveMessage = (value: unknown): value is LiveMessage => {
  if (typeof value !== "object" || value === null) return false;
  const message = value as LiveMessage;
  if (message.type === "welcome") return typeof message.afterSeq === "number";
  return message.type === "events" && Array.isArray(message.events);
};

export const liveUrl = (sessionId: string, location: { protocol: string; host: string }): string => {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${location.host}/ws/sessions/${encodeURIComponent(sessionId)}`;
};

export interface LiveConnection {
  readonly close: () => void;
}

/**
 * Subscribes to a session's committed events. One-directional by design: corrections are written
 * over HTTP, so nothing here needs to send. Anything unrecognised on the wire is ignored rather
 * than thrown, since a stray frame should not take the room's view down.
 */
export const connectLive = (sessionId: string, onMessage: (message: LiveMessage) => void): LiveConnection => {
  const socket = new WebSocket(liveUrl(sessionId, window.location));

  socket.addEventListener("message", (event) => {
    try {
      const parsed: unknown = JSON.parse(String(event.data));
      if (isLiveMessage(parsed)) onMessage(parsed);
    } catch {
      // A frame we cannot read tells us nothing; the next one may.
    }
  });

  return { close: () => socket.close() };
};
