import { emptyFlow, reduce, type FlowEvent, type FlowState } from "@autoflow/core";
import { describe, expect, it } from "vitest";
import { renderFlowMarkdown, renderFlowText } from "../src/render.ts";

const build = (events: FlowEvent[]): FlowState =>
  events.reduce((s, e) => {
    const r = reduce(s, e);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, emptyFlow());

const state = build([
  { type: "ClaimAdded", claim: { id: "c1", text: "The market is large", order: 0 } },
  { type: "ClaimAdded", claim: { id: "c2", text: "The team is strong", order: 1 } },
  {
    type: "ArgumentAdded",
    argument: { id: "a1", claimId: "c2", text: "No prior exits", stance: "attack", respondsTo: null, source: "prelim", sourceRefs: [] },
  },
]);

describe("renderFlowText", () => {
  it("lists claims in memo order with their status", () => {
    const text = renderFlowText(state);
    expect(text.indexOf("The market is large")).toBeLessThan(text.indexOf("The team is strong"));
    expect(text).toMatch(/untested.*The market is large/i);
    expect(text).toMatch(/contested.*The team is strong/i);
  });

  it("shows arguments under their row with stance and a drop marker", () => {
    const text = renderFlowText(state);
    expect(text).toMatch(/attack.*No prior exits/);
    expect(text).toMatch(/drop/i);
  });

  it("says so when there are no claims", () => {
    expect(renderFlowText(emptyFlow())).toMatch(/no claims/i);
  });
});

describe("renderFlowMarkdown", () => {
  it("emits one numbered heading per claim with a status line", () => {
    const md = renderFlowMarkdown(state);
    expect(md).toContain("## 1. The market is large");
    expect(md).toContain("## 2. The team is strong");
    expect(md).toMatch(/\*\*Status:\*\* contested/);
  });
});
