import { describe, expect, it } from "vitest";
import { memoToEvents, sequentialIds, type ExtractedClaim } from "../src/index.ts";

const claim = (text: string, topic = "Market", evidence: { text: string; excerpt: string }[] = []): ExtractedClaim => ({
  text,
  excerpt: `src: ${text}`,
  topic,
  evidence,
});

describe("memoToEvents", () => {
  it("emits one ClaimAdded per claim, ordered as given, carrying the topic", () => {
    const events = memoToEvents([claim("Market is large"), claim("Team is strong", "Team")], sequentialIds("c"));
    expect(events).toEqual([
      { type: "ClaimAdded", claim: { id: "c1", text: "Market is large", order: 0, topic: "Market" } },
      { type: "ClaimAdded", claim: { id: "c2", text: "Team is strong", order: 1, topic: "Team" } },
    ]);
  });

  it("omits the topic field when the topic is blank", () => {
    const [event] = memoToEvents([claim("A", "  ")], sequentialIds("c"));
    expect(event).toEqual({ type: "ClaimAdded", claim: { id: "c1", text: "A", order: 0 } });
  });

  it("turns evidence into memo-sourced support arguments on the claim, in order", () => {
    const events = memoToEvents(
      [claim("Traction is strong", "Traction", [{ text: "ARR is $1.4M", excerpt: "ARR is $1.4M" }, { text: "NRR is 140%", excerpt: "" }])],
      sequentialIds("x"),
    );
    expect(events).toEqual([
      { type: "ClaimAdded", claim: { id: "x1", text: "Traction is strong", order: 0, topic: "Traction" } },
      {
        type: "ArgumentAdded",
        argument: { id: "x2", claimId: "x1", text: "ARR is $1.4M", stance: "support", respondsTo: null, source: "memo", sourceRefs: ["ARR is $1.4M"] },
      },
      {
        type: "ArgumentAdded",
        argument: { id: "x3", claimId: "x1", text: "NRR is 140%", stance: "support", respondsTo: null, source: "memo", sourceRefs: [] },
      },
    ]);
  });

  it("trims whitespace and drops blank claims without leaving gaps in order", () => {
    const events = memoToEvents([claim("  A  "), claim("   "), claim("B")], sequentialIds("c"));
    expect(events.map((e) => e.type === "ClaimAdded" && [e.claim.text, e.claim.order])).toEqual([["A", 0], ["B", 1]]);
  });

  it("drops case-insensitive duplicate claims and duplicate evidence, keeping the first", () => {
    const events = memoToEvents(
      [claim("Team is strong", "Team", [{ text: "Ex-Bain", excerpt: "" }, { text: "ex-bain", excerpt: "" }]), claim("team is STRONG")],
      sequentialIds("c"),
    );
    const texts = events.map((e) => (e.type === "ClaimAdded" ? e.claim.text : e.type === "ArgumentAdded" ? e.argument.text : e.type));
    expect(texts).toEqual(["Team is strong", "Ex-Bain"]);
  });

  it("returns an empty list for no claims", () => {
    expect(memoToEvents([], sequentialIds("c"))).toEqual([]);
  });
});
