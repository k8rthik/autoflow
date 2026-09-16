import { emptyFlow } from "@autoflow/core";
import { describe, expect, it } from "vitest";
import { applyEvent, decodeDoc, emptyDoc, encodeDoc, hasFlow, projectDoc, undoLast, type FlowDoc } from "../src/lib/store.ts";

const claimAdded = (id: string, order = 0) => ({ type: "ClaimAdded" as const, claim: { id, text: `claim ${id}`, order } });

describe("store", () => {
  it("applies a valid event by appending it to the log", () => {
    const result = applyEvent(emptyDoc(), emptyFlow(), claimAdded("c1"));
    expect(result.ok && result.value.events).toHaveLength(1);
  });

  it("refuses an invalid event and leaves the log untouched", () => {
    const doc: FlowDoc = { title: "t", events: [claimAdded("c1")] };
    const result = applyEvent(doc, projectDoc(doc), claimAdded("c1"));
    expect(result.ok).toBe(false);
    expect(doc.events).toHaveLength(1);
  });

  it("undo drops the last event and never goes below empty", () => {
    const doc: FlowDoc = { title: "t", events: [claimAdded("c1"), claimAdded("c2", 1)] };
    expect(undoLast(doc).events).toHaveLength(1);
    expect(undoLast(undoLast(undoLast(doc))).events).toHaveLength(0);
  });

  it("round-trips through encode and decode", () => {
    const doc: FlowDoc = { title: "Memo", events: [claimAdded("c1")] };
    expect(decodeDoc(encodeDoc(doc))).toEqual(doc);
  });

  it("rejects malformed or non-replayable stored documents", () => {
    expect(decodeDoc(null)).toBeNull();
    expect(decodeDoc("not json")).toBeNull();
    expect(decodeDoc(JSON.stringify({ title: 1, events: [] }))).toBeNull();
    expect(decodeDoc(JSON.stringify({ title: "t", events: [claimAdded("c1"), claimAdded("c1")] }))).toBeNull();
  });

  it("hasFlow is false for an empty document", () => {
    expect(hasFlow(emptyDoc())).toBe(false);
    expect(hasFlow({ title: "t", events: [claimAdded("c1")] })).toBe(true);
  });
});
