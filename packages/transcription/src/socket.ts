import { WebSocket } from "ws";

export interface SocketHandlers {
  readonly onOpen: () => void;
  readonly onMessage: (text: string) => void;
  /** Fires exactly once, whether the socket closed cleanly, was refused, or failed. */
  readonly onClose: (code: number, reason: string) => void;
  /** Detail for a failure; `onClose` still follows it. */
  readonly onError: (error: Error) => void;
}

export interface ProviderSocket {
  send(data: Uint8Array | string): void;
  /** Drops the connection without the closing handshake; `onClose` still fires. */
  terminate(): void;
}

export interface ConnectRequest {
  readonly url: string;
  readonly apiKey: string;
}

/** The transport seam: tests replace it with a fake, production uses `connectWebSocket`. */
export type Connect = (request: ConnectRequest, handlers: SocketHandlers) => ProviderSocket;

/** Deepgram authenticates a server-side stream with `Authorization: Token <key>` on the upgrade request. */
export const connectWebSocket: Connect = ({ url, apiKey }, handlers) => {
  const socket = new WebSocket(url, { headers: { Authorization: `Token ${apiKey}` } });
  socket.on("open", handlers.onOpen);
  socket.on("message", (data, isBinary) => {
    if (!isBinary) handlers.onMessage(String(data));
  });
  socket.on("close", (code, reason) => handlers.onClose(code, reason.toString()));
  socket.on("error", handlers.onError);

  return {
    send: (data) => socket.send(data),
    terminate: () => socket.terminate(),
  };
};
