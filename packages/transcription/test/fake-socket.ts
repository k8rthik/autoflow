import type { Connect, ConnectRequest, SocketHandlers } from "../src/socket.ts";

export interface FakeConnection {
  readonly request: ConnectRequest;
  readonly handlers: SocketHandlers;
  /** Everything the adapter sent, in order: audio as bytes, control frames as parsed JSON. */
  readonly sent: (Uint8Array | Record<string, unknown>)[];
  terminated: boolean;
}

/** Stands in for Deepgram's socket. The test plays Deepgram by calling the captured handlers. */
export const fakeDeepgram = (): { readonly connect: Connect; readonly connections: FakeConnection[] } => {
  const connections: FakeConnection[] = [];
  const connect: Connect = (request, handlers) => {
    const connection: FakeConnection = { request, handlers, sent: [], terminated: false };
    connections.push(connection);
    return {
      send: (data) => connection.sent.push(typeof data === "string" ? (JSON.parse(data) as Record<string, unknown>) : data),
      terminate: () => {
        connection.terminated = true;
      },
    };
  };
  return { connect, connections };
};

export const results = (fields: { start: number; duration: number; isFinal: boolean; transcript: string; confidence?: number }): string =>
  JSON.stringify({
    type: "Results",
    channel_index: [0, 1],
    start: fields.start,
    duration: fields.duration,
    is_final: fields.isFinal,
    speech_final: fields.isFinal,
    channel: { alternatives: [{ transcript: fields.transcript, confidence: fields.confidence ?? 0.9, words: [] }] },
    metadata: { request_id: "req-1" },
  });
