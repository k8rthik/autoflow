import { describe, expect, it } from "vitest";
import { memoToEvents, sequentialIds } from "../src/index.ts";

const claims = (...texts: string[]) => texts.map((text) => ({ text, excerpt: `src: ${text}` }));

describe("memoToEvents", () => {
  it("emits one ClaimAdded per claim, ordered as given", () => {
    const events = memoToEvents(claims("Market is large", "Team is strong"), sequentialIds("c"));
    expect(events).toEqual([
      { type: "ClaimAdded", claim: { id: "c1", text: "Market is large", order: 0 } },
      { type: "ClaimAdded", claim: { id: "c2", text: "Team is strong", order: 1 } },
    ]);
  });

  it("trims whitespace and drops blank claims without leaving gaps in order", () => {
    const events = memoToEvents(claims("  A  ", "   ", "B"), sequentialIds("c"));
    expect(events.map((e) => e.type === "ClaimAdded" && [e.claim.text, e.claim.order])).toEqual([["A", 0], ["B", 1]]);
  });

  it("drops case-insensitive duplicate claims, keeping the first", () => {
    const events = memoToEvents(claims("Team is strong", "team is STRONG", "Other"), sequentialIds("c"));
    expect(events.map((e) => e.type === "ClaimAdded" && e.claim.text)).toEqual(["Team is strong", "Other"]);
  });

  it("returns an empty list for no claims", () => {
    expect(memoToEvents([], sequentialIds("c"))).toEqual([]);
  });
});
