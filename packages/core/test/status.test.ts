import { describe, expect, it } from "vitest";
import { statusOf, statusOfAll } from "../src/index.ts";
import { addArg, addClaim, build } from "./fixtures.ts";

describe("statusOf", () => {
  it("is untested with no drops for an empty row", () => {
    const state = build([addClaim("c1")]);
    expect(statusOf(state, "c1")).toEqual({ status: "untested", standing: [], drops: [] });
  });

  it("is supported when only a support stands", () => {
    const state = build([addClaim("c1"), addArg("s1", "c1", "support")]);
    expect(statusOf(state, "c1")).toEqual({ status: "supported", standing: ["s1"], drops: [] });
  });

  it("is contested when an attack has no response", () => {
    const state = build([addClaim("c1"), addArg("a1", "c1", "attack")]);
    expect(statusOf(state, "c1")).toEqual({ status: "contested", standing: ["a1"], drops: ["a1"] });
  });

  it("is open when a question has no response", () => {
    const state = build([addClaim("c1"), addArg("q1", "c1", "question")]);
    expect(statusOf(state, "c1")).toEqual({ status: "open", standing: ["q1"], drops: ["q1"] });
  });

  it("is supported when an attack is answered by a support", () => {
    const state = build([addClaim("c1"), addArg("a1", "c1", "attack"), addArg("s1", "c1", "support", "a1")]);
    expect(statusOf(state, "c1")).toEqual({ status: "supported", standing: ["s1"], drops: [] });
  });

  it("is contested when a support is attacked", () => {
    const state = build([addClaim("c1"), addArg("s1", "c1", "support"), addArg("a1", "c1", "attack", "s1")]);
    expect(statusOf(state, "c1").status).toBe("contested");
  });

  it("is open when an attack is answered only by a standing question", () => {
    const state = build([addClaim("c1"), addArg("a1", "c1", "attack"), addArg("q1", "c1", "question", "a1")]);
    expect(statusOf(state, "c1")).toEqual({ status: "open", standing: ["q1"], drops: ["q1"] });
  });

  it("contested outranks open when both an attack and a question stand", () => {
    const state = build([addClaim("c1"), addArg("q1", "c1", "question"), addArg("a1", "c1", "attack")]);
    expect(statusOf(state, "c1")).toEqual({ status: "contested", standing: ["q1", "a1"], drops: ["q1", "a1"] });
  });

  it("lists only the unanswered attack as a drop when one of two is answered", () => {
    const state = build([
      addClaim("c1"),
      addArg("a1", "c1", "attack"),
      addArg("a2", "c1", "attack"),
      addArg("s1", "c1", "support", "a1"),
    ]);
    expect(statusOf(state, "c1")).toEqual({ status: "contested", standing: ["a2", "s1"], drops: ["a2"] });
  });

  it("does not depend on the order of arrows across the row", () => {
    // a1 (attack) ← s1 answers it, then a2 attacks s1, then s2 answers a2: chain ends in support.
    const state = build([
      addClaim("c1"),
      addArg("a1", "c1", "attack"),
      addArg("s1", "c1", "support", "a1"),
      addArg("a2", "c1", "attack", "s1"),
      addArg("s2", "c1", "support", "a2"),
    ]);
    expect(statusOf(state, "c1")).toEqual({ status: "supported", standing: ["s2"], drops: [] });
  });

  it("throws for an unknown claim", () => {
    expect(() => statusOf(build([]), "nope")).toThrow(/nope/);
  });
});

describe("statusOfAll", () => {
  it("returns a status for every claim, keyed by id", () => {
    const state = build([addClaim("c1", 0), addClaim("c2", 1), addArg("a1", "c2", "attack")]);
    expect(statusOfAll(state)).toEqual({
      c1: { status: "untested", standing: [], drops: [] },
      c2: { status: "contested", standing: ["a1"], drops: ["a1"] },
    });
  });
});
