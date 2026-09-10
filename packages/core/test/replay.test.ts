import { describe, expect, it } from "vitest";
import type { FlowEvent } from "../src/index.ts";
import { emptyFlow, replay, replaySteps } from "../src/index.ts";
import { addArg, addClaim, build } from "./fixtures.ts";

const events: readonly FlowEvent[] = [addClaim("c1"), addArg("a1", "c1", "attack"), addArg("s1", "c1", "support", "a1")];

describe("replay", () => {
  it("reproduces the state that sequential reduction produces", () => {
    const result = replay(events);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(build(events));
  });

  it("returns the empty flow for no events", () => {
    const result = replay([]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(emptyFlow());
  });

  it("stops at the first invalid event and reports its index", () => {
    const bad: readonly FlowEvent[] = [addClaim("c1"), addArg("a1", "ghost", "attack"), addArg("a2", "c1", "support")];
    const result = replay(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CLAIM_NOT_FOUND");
      expect(result.error.eventIndex).toBe(1);
    }
  });
});

describe("replaySteps", () => {
  it("yields the state after each event, starting from the initial state", () => {
    const result = replaySteps(events);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(events.length + 1);
    expect(result.value[0]).toEqual(emptyFlow());
    expect(result.value.at(-1)).toEqual(build(events));
    expect(result.value[1]).toEqual(build(events.slice(0, 1)));
  });
});
