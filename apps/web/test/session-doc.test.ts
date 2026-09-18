import type { RecordedEvent } from "@autoflow/core";
import { describe, expect, it } from "vitest";
import { lastSeq, mergeEvents, projectSession, type SessionDoc } from "../src/lib/session-doc.ts";

const session = { id: "s1", title: "Larkspur", createdAt: "2026-09-18T10:00:00.000Z" };

const recorded = (seq: number, event: RecordedEvent["event"]): RecordedEvent => ({
  seq,
  at: "2026-09-18T10:00:00.000Z",
  actor: "participant",
  event,
});

const added = (id: string, order: number) => recorded(order + 1, { type: "ClaimAdded", claim: { id, text: `Claim ${id}`, order } });
const doc = (events: readonly RecordedEvent[]): SessionDoc => ({ session, events });

describe("projectSession", () => {
  it("replays the log into the flow the room sees", () => {
    const state = projectSession(doc([added("c1", 0), added("c2", 1)]));
    expect(Object.keys(state.claims)).toEqual(["c1", "c2"]);
  });

  it("falls back to an empty flow rather than crashing on a log that will not replay", () => {
    const state = projectSession(doc([recorded(1, { type: "ClaimRenamed", claimId: "ghost", text: "x" })]));
    expect(state.claims).toEqual({});
  });
});

describe("lastSeq", () => {
  it("is the sequence of the newest event, and zero on an empty log", () => {
    expect(lastSeq(doc([added("c1", 0), added("c2", 1)]))).toBe(2);
    expect(lastSeq(doc([]))).toBe(0);
  });
});

describe("mergeEvents", () => {
  it("adds events the log has not seen", () => {
    const merged = mergeEvents(doc([added("c1", 0)]), [added("c2", 1)]);
    expect(merged.events.map((e) => e.seq)).toEqual([1, 2]);
  });

  it("ignores an event already held, so our own POST and the live push do not double up", () => {
    const start = doc([added("c1", 0), added("c2", 1)]);
    const merged = mergeEvents(start, [added("c2", 1)]);
    expect(merged.events.map((e) => e.seq)).toEqual([1, 2]);
    expect(merged).toBe(start);
  });

  it("keeps the log in sequence order whichever order events arrive in", () => {
    const merged = mergeEvents(doc([added("c1", 0)]), [added("c3", 2), added("c2", 1)]);
    expect(merged.events.map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it("leaves the session alone", () => {
    expect(mergeEvents(doc([]), [added("c1", 0)]).session).toEqual(session);
  });
});
