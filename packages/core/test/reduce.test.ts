import { describe, expect, it } from "vitest";
import { emptyFlow, reduce } from "../src/index.ts";
import { addArg, addClaim, arg, build, claim } from "./fixtures.ts";

const expectError = (state: ReturnType<typeof emptyFlow>, event: Parameters<typeof reduce>[1], code: string) => {
  const result = reduce(state, event);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe(code);
};

describe("reduce: claims", () => {
  it("ClaimAdded creates the claim and an empty row", () => {
    const state = build([addClaim("c1")]);
    expect(state.claims["c1"]).toEqual(claim("c1"));
    expect(state.rows["c1"]).toEqual([]);
  });

  it("ClaimAdded rejects a duplicate id", () => {
    expectError(build([addClaim("c1")]), addClaim("c1"), "CLAIM_EXISTS");
  });

  it("ClaimRenamed changes only the text", () => {
    const state = build([addClaim("c1"), { type: "ClaimRenamed", claimId: "c1", text: "new" }]);
    expect(state.claims["c1"]).toEqual({ ...claim("c1"), text: "new" });
  });

  it("ClaimRenamed rejects an unknown claim", () => {
    expectError(emptyFlow(), { type: "ClaimRenamed", claimId: "nope", text: "x" }, "CLAIM_NOT_FOUND");
  });

  it("ClaimRemoved removes the claim, its row, and its arguments", () => {
    const state = build([addClaim("c1"), addArg("a1", "c1", "attack"), { type: "ClaimRemoved", claimId: "c1" }]);
    expect(state.claims["c1"]).toBeUndefined();
    expect(state.rows["c1"]).toBeUndefined();
    expect(state.arguments["a1"]).toBeUndefined();
  });

  it("ClaimsMerged appends the source row onto the target and removes the source claim", () => {
    const state = build([
      addClaim("c1", 0),
      addClaim("c2", 1),
      addArg("a1", "c1", "support"),
      addArg("a2", "c2", "attack"),
      addArg("a3", "c2", "support", "a2"),
      { type: "ClaimsMerged", into: "c1", from: "c2" },
    ]);
    expect(state.rows["c1"]).toEqual(["a1", "a2", "a3"]);
    expect(state.claims["c2"]).toBeUndefined();
    expect(state.rows["c2"]).toBeUndefined();
    expect(state.arguments["a2"]?.claimId).toBe("c1");
    expect(state.arguments["a3"]).toMatchObject({ claimId: "c1", respondsTo: "a2" });
  });

  it("ClaimsMerged rejects merging a claim into itself", () => {
    expectError(build([addClaim("c1")]), { type: "ClaimsMerged", into: "c1", from: "c1" }, "INVALID_MERGE");
  });
});

describe("reduce: arguments", () => {
  const base = build([addClaim("c1"), addClaim("c2")]);

  it("ArgumentAdded appends to the end of its row", () => {
    const state = build([addArg("a1", "c1", "attack"), addArg("a2", "c1", "support", "a1")], base);
    expect(state.rows["c1"]).toEqual(["a1", "a2"]);
    expect(state.arguments["a2"]).toEqual(arg("a2", "c1", "support", "a1"));
  });

  it("ArgumentAdded rejects an unknown claim", () => {
    expectError(base, addArg("a1", "nope", "attack"), "CLAIM_NOT_FOUND");
  });

  it("ArgumentAdded rejects a duplicate argument id", () => {
    expectError(build([addArg("a1", "c1", "attack")], base), addArg("a1", "c1", "support"), "ARGUMENT_EXISTS");
  });

  it("ArgumentAdded rejects an arrow to an unknown argument", () => {
    expectError(base, addArg("a1", "c1", "support", "ghost"), "ARGUMENT_NOT_FOUND");
  });

  it("ArgumentAdded rejects an arrow into a different row", () => {
    const state = build([addArg("a1", "c1", "attack")], base);
    expectError(state, addArg("a2", "c2", "support", "a1"), "ARROW_CROSSES_ROWS");
  });

  it("ArgumentEdited changes only the text", () => {
    const state = build([addArg("a1", "c1", "attack"), { type: "ArgumentEdited", argumentId: "a1", text: "t" }], base);
    expect(state.arguments["a1"]).toEqual({ ...arg("a1", "c1", "attack"), text: "t" });
  });

  it("ArgumentRestanced changes only the stance", () => {
    const state = build(
      [addArg("a1", "c1", "attack"), { type: "ArgumentRestanced", argumentId: "a1", stance: "question" }],
      base,
    );
    expect(state.arguments["a1"]?.stance).toBe("question");
  });

  it("ArgumentMoved appends to the target row, resets its arrow, and splices dependents past it", () => {
    const state = build(
      [
        addArg("a1", "c1", "attack"),
        addArg("a2", "c1", "support", "a1"),
        addArg("a3", "c1", "attack", "a2"),
        { type: "ArgumentMoved", argumentId: "a2", toClaimId: "c2" },
      ],
      base,
    );
    expect(state.rows["c1"]).toEqual(["a1", "a3"]);
    expect(state.rows["c2"]).toEqual(["a2"]);
    expect(state.arguments["a2"]).toMatchObject({ claimId: "c2", respondsTo: null });
    expect(state.arguments["a3"]?.respondsTo).toBe("a1");
  });

  it("ArgumentMoved rejects an unknown target claim", () => {
    const state = build([addArg("a1", "c1", "attack")], base);
    expectError(state, { type: "ArgumentMoved", argumentId: "a1", toClaimId: "nope" }, "CLAIM_NOT_FOUND");
  });

  it("ArrowRepointed accepts an earlier argument in the same row", () => {
    const state = build(
      [
        addArg("a1", "c1", "attack"),
        addArg("a2", "c1", "attack"),
        addArg("a3", "c1", "support", "a2"),
        { type: "ArrowRepointed", argumentId: "a3", respondsTo: "a1" },
      ],
      base,
    );
    expect(state.arguments["a3"]?.respondsTo).toBe("a1");
  });

  it("ArrowRepointed accepts null to point at the claim itself", () => {
    const state = build(
      [addArg("a1", "c1", "attack"), addArg("a2", "c1", "support", "a1"), { type: "ArrowRepointed", argumentId: "a2", respondsTo: null }],
      base,
    );
    expect(state.arguments["a2"]?.respondsTo).toBeNull();
  });

  it("ArrowRepointed rejects pointing forward in the row", () => {
    const state = build([addArg("a1", "c1", "attack"), addArg("a2", "c1", "support")], base);
    expectError(state, { type: "ArrowRepointed", argumentId: "a1", respondsTo: "a2" }, "ARROW_POINTS_FORWARD");
  });

  it("ArrowRepointed rejects pointing at itself", () => {
    const state = build([addArg("a1", "c1", "attack")], base);
    expectError(state, { type: "ArrowRepointed", argumentId: "a1", respondsTo: "a1" }, "ARROW_POINTS_FORWARD");
  });

  it("ArgumentsMerged drops one argument and repoints its dependents to the kept one", () => {
    const state = build(
      [
        addArg("a1", "c1", "attack"),
        addArg("a2", "c1", "attack"),
        addArg("a3", "c1", "support", "a2"),
        { type: "ArgumentsMerged", keep: "a1", drop: "a2" },
      ],
      base,
    );
    expect(state.rows["c1"]).toEqual(["a1", "a3"]);
    expect(state.arguments["a2"]).toBeUndefined();
    expect(state.arguments["a3"]?.respondsTo).toBe("a1");
  });

  it("ArgumentsMerged keeps the earlier position and arrow when the kept argument is later", () => {
    const state = build(
      [
        addArg("a1", "c1", "attack"),
        addArg("a2", "c1", "support", "a1"),
        addArg("a3", "c1", "support", "a2"),
        { type: "ArgumentsMerged", keep: "a3", drop: "a2" },
      ],
      base,
    );
    expect(state.rows["c1"]).toEqual(["a1", "a3"]);
    expect(state.arguments["a3"]).toMatchObject({ text: "argument a3", respondsTo: "a1" });
  });

  it("ArgumentsMerged rejects merging an argument with itself", () => {
    const state = build([addArg("a1", "c1", "attack")], base);
    expectError(state, { type: "ArgumentsMerged", keep: "a1", drop: "a1" }, "INVALID_MERGE");
  });

  it("ArgumentMoved to its own row is a no-op", () => {
    const state = build([addArg("a1", "c1", "attack")], base);
    const result = reduce(state, { type: "ArgumentMoved", argumentId: "a1", toClaimId: "c1" });
    expect(result.ok && result.value).toEqual(state);
  });

  it("ArgumentsMerged rejects arguments on different rows", () => {
    const state = build([addArg("a1", "c1", "attack"), addArg("a2", "c2", "attack")], base);
    expectError(state, { type: "ArgumentsMerged", keep: "a1", drop: "a2" }, "INVALID_MERGE");
  });

  it("ArgumentRemoved removes it and repoints dependents to what it answered", () => {
    const state = build(
      [
        addArg("a1", "c1", "attack"),
        addArg("a2", "c1", "support", "a1"),
        addArg("a3", "c1", "attack", "a2"),
        { type: "ArgumentRemoved", argumentId: "a2" },
      ],
      base,
    );
    expect(state.rows["c1"]).toEqual(["a1", "a3"]);
    expect(state.arguments["a3"]?.respondsTo).toBe("a1");
  });

  it("ArgumentRemoved rejects an unknown argument", () => {
    expectError(base, { type: "ArgumentRemoved", argumentId: "nope" }, "ARGUMENT_NOT_FOUND");
  });
});

describe("reduce: immutability", () => {
  it("never mutates the input state", () => {
    const before = build([addClaim("c1"), addArg("a1", "c1", "attack")]);
    const snapshot = JSON.parse(JSON.stringify(before));
    const after = reduce(before, addArg("a2", "c1", "support", "a1"));
    expect(after.ok).toBe(true);
    expect(before).toEqual(snapshot);
    if (after.ok) expect(after.value).not.toBe(before);
  });

  it("returns a new state object on a failed event as well", () => {
    const before = emptyFlow();
    const snapshot = JSON.parse(JSON.stringify(before));
    reduce(before, { type: "ClaimRenamed", claimId: "nope", text: "x" });
    expect(before).toEqual(snapshot);
  });
});
