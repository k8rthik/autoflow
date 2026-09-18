import { afterEach, describe, expect, it, vi } from "vitest";
import { connectLive, liveUrl } from "../src/lib/live.ts";

class FakeSocket {
  static last: FakeSocket | undefined;
  readonly listeners = new Map<string, (event: { data: unknown }) => void>();
  readonly close = vi.fn();
  constructor(readonly url: string) {
    FakeSocket.last = this;
  }
  addEventListener(type: string, handler: (event: { data: unknown }) => void): void {
    this.listeners.set(type, handler);
  }
  receive(data: unknown): void {
    this.listeners.get("message")?.({ data });
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeSocket.last = undefined;
});

const connect = (onMessage = vi.fn()) => {
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal("window", { ...globalThis.window, location: { protocol: "http:", host: "localhost:5173" } });
  const connection = connectLive("s1", onMessage);
  const socket = FakeSocket.last;
  if (!socket) throw new Error("No socket was opened");
  return { connection, socket, onMessage };
};

describe("liveUrl", () => {
  it("follows the page's scheme so a secure page gets a secure socket", () => {
    expect(liveUrl("s1", { protocol: "http:", host: "localhost:5173" })).toBe("ws://localhost:5173/ws/sessions/s1");
    expect(liveUrl("s1", { protocol: "https:", host: "flow.atland.vc" })).toBe("wss://flow.atland.vc/ws/sessions/s1");
  });

  it("escapes the session id", () => {
    expect(liveUrl("a/b", { protocol: "http:", host: "h" })).toBe("ws://h/ws/sessions/a%2Fb");
  });
});

describe("connectLive", () => {
  it("passes on events the server pushes", () => {
    const { socket, onMessage } = connect();
    const message = { type: "events", events: [{ seq: 2, at: "now", actor: "participant", event: { type: "ClaimRemoved", claimId: "c1" } }] };

    socket.receive(JSON.stringify(message));

    expect(onMessage).toHaveBeenCalledWith(message);
  });

  it("passes on the welcome that says where the stream starts", () => {
    const { socket, onMessage } = connect();
    socket.receive(JSON.stringify({ type: "welcome", afterSeq: 4 }));
    expect(onMessage).toHaveBeenCalledWith({ type: "welcome", afterSeq: 4 });
  });

  it("ignores a frame it cannot read rather than taking the room down", () => {
    const { socket, onMessage } = connect();

    socket.receive("not json");
    socket.receive(JSON.stringify({ type: "something-else" }));
    socket.receive(JSON.stringify({ type: "events", events: "not an array" }));
    socket.receive(JSON.stringify(null));

    expect(onMessage).not.toHaveBeenCalled();
  });

  it("closes the socket when the room is left", () => {
    const { connection, socket } = connect();
    connection.close();
    expect(socket.close).toHaveBeenCalled();
  });
});
