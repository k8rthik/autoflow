import { describe, expect, it } from "vitest";
import { hashForSession, sessionIdFromHash } from "../src/lib/room-url.ts";

describe("room URL", () => {
  it("round-trips a session id through the hash", () => {
    expect(sessionIdFromHash(hashForSession("abc-123"))).toBe("abc-123");
  });

  it("escapes an id that would otherwise break the hash", () => {
    const id = "a/b c";
    expect(hashForSession(id)).toBe("#/s/a%2Fb%20c");
    expect(sessionIdFromHash(hashForSession(id))).toBe(id);
  });

  it("reads nothing out of a hash that names no room", () => {
    expect(sessionIdFromHash("")).toBeNull();
    expect(sessionIdFromHash("#")).toBeNull();
    expect(sessionIdFromHash("#/s/")).toBeNull();
    expect(sessionIdFromHash("#/s/%20")).toBeNull();
    expect(sessionIdFromHash("#/other/s1")).toBeNull();
  });
});
