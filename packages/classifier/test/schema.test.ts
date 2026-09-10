import { describe, expect, it } from "vitest";
import { ClaimExtractionSchema } from "../src/index.ts";

describe("ClaimExtractionSchema", () => {
  it("accepts a well-formed extraction", () => {
    const parsed = ClaimExtractionSchema.safeParse({ claims: [{ text: "A", excerpt: "the memo says A" }] });
    expect(parsed.success).toBe(true);
  });

  it("rejects a claim missing its excerpt", () => {
    expect(ClaimExtractionSchema.safeParse({ claims: [{ text: "A" }] }).success).toBe(false);
  });

  it("rejects a payload without a claims array", () => {
    expect(ClaimExtractionSchema.safeParse({}).success).toBe(false);
  });
});
