import { emptyFlow, reduce, type FlowEvent, type FlowState } from "@autoflow/core";
import { describe, expect, it } from "vitest";
import { groupByTopic, renderFlowMarkdown, renderFlowText } from "../src/render.ts";

const build = (events: FlowEvent[]): FlowState =>
  events.reduce((s, e) => {
    const r = reduce(s, e);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, emptyFlow());

const state = build([
  { type: "ClaimAdded", claim: { id: "c1", text: "The market is large", order: 0, topic: "Market" } },
  { type: "ClaimAdded", claim: { id: "c2", text: "The team is strong", order: 1, topic: "Team" } },
  {
    type: "ArgumentAdded",
    argument: { id: "a1", claimId: "c2", text: "No prior exits", stance: "attack", respondsTo: null, source: "prelim", sourceRefs: [] },
  },
]);

describe("renderFlowText", () => {
  it("lists claims in memo order with their status, under topic headings", () => {
    const text = renderFlowText(state);
    expect(text).toMatch(/^MARKET$/m);
    expect(text).toMatch(/^TEAM$/m);
    expect(text.indexOf("The market is large")).toBeLessThan(text.indexOf("The team is strong"));
    expect(text).toMatch(/untested.*The market is large/i);
    expect(text).toMatch(/contested.*The team is strong/i);
  });

  it("shows arguments under their row with a stance mark and a drop marker", () => {
    const text = renderFlowText(state);
    expect(text).toMatch(/1\. - No prior exits\s+\[drop\]/);
  });

  it("says so when there are no claims", () => {
    expect(renderFlowText(emptyFlow())).toMatch(/no claims/i);
  });
});

describe("renderFlowMarkdown", () => {
  it("emits a topic heading per group and a numbered heading per claim with a status line", () => {
    const md = renderFlowMarkdown(state);
    expect(md).toContain("## Market\n\n### 1. The market is large");
    expect(md).toContain("## Team\n\n### 2. The team is strong");
    expect(md).toMatch(/\*\*Status:\*\* contested/);
  });
});

describe("groupByTopic", () => {
  const c = (id: string, topic?: string) => ({ id, text: id, order: 0, ...(topic ? { topic } : {}) });

  it("groups consecutive claims with the same topic and keeps untopiced claims separate", () => {
    const groups = groupByTopic([c("a", "Market"), c("b", "Market"), c("c"), c("d"), c("e", "Market")]);
    expect(groups.map((g) => [g.topic, g.claims.map((x) => x.id)])).toEqual([
      ["Market", ["a", "b"]],
      [null, ["c"]],
      [null, ["d"]],
      ["Market", ["e"]],
    ]);
  });
});
