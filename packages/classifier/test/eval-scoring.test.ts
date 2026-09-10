import { describe, expect, it } from "vitest";
import { excerptGrounded } from "../eval/grounding.ts";
import { score, type Alignment } from "../eval/scoring.ts";

const a = (candidate: number, gold: number | null, forbidden: number | null = null, compound = false): Alignment => ({
  candidate,
  gold,
  forbidden,
  compound,
});

describe("score", () => {
  it("is perfect when every candidate maps to a distinct gold claim and all gold is covered", () => {
    expect(score(2, 2, [a(0, 0), a(1, 1)])).toEqual({
      precision: 1,
      recall: 1,
      f1: 1,
      leak_rate: 0,
      compound_rate: 0,
      redundant_rate: 0,
    });
  });

  it("is zero across the board for no candidates", () => {
    expect(score(3, 0, [])).toMatchObject({ precision: 0, recall: 0, f1: 0 });
  });

  it("counts a forbidden match as a leak and a non-match for precision", () => {
    const s = score(2, 2, [a(0, 0), a(1, null, 0)]);
    expect(s).toMatchObject({ precision: 0.5, recall: 0.5, leak_rate: 0.5 });
  });

  it("counts a second candidate on the same gold claim as redundant, not as extra recall", () => {
    const s = score(2, 3, [a(0, 0), a(1, 0), a(2, 1)]);
    expect(s.recall).toBe(1);
    expect(s.precision).toBe(1);
    expect(s.redundant_rate).toBeCloseTo(1 / 3);
  });

  it("reports the compound rate", () => {
    expect(score(1, 2, [a(0, 0, null, true), a(1, null)]).compound_rate).toBe(0.5);
  });
});

describe("excerptGrounded", () => {
  const memo = "ARR is $1.4M with net revenue retention of 140% — “strong pull”.\nNext line here.";

  it("matches a verbatim excerpt", () => {
    expect(excerptGrounded(memo, "net revenue retention of 140%")).toBe(true);
  });

  it("tolerates quote and dash re-encoding and whitespace changes", () => {
    expect(excerptGrounded(memo, '140% - "strong pull".  Next   line')).toBe(true);
  });

  it("rejects a paraphrase and an empty excerpt", () => {
    expect(excerptGrounded(memo, "NRR is 140 percent")).toBe(false);
    expect(excerptGrounded(memo, "   ")).toBe(false);
  });
});
