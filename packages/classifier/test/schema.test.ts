import { describe, expect, it } from "vitest";
import { ClaimExtractionSchema } from "../src/index.ts";

describe("ClaimExtractionSchema", () => {
  it("accepts a well-formed extraction", () => {
    const parsed = ClaimExtractionSchema.safeParse({
      claims: [{ topic: "Market", text: "A", excerpt: "the memo says A", evidence: [{ text: "e", excerpt: "x" }] }],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a claim missing its excerpt, topic or evidence list", () => {
    expect(ClaimExtractionSchema.safeParse({ claims: [{ text: "A", topic: "T", evidence: [] }] }).success).toBe(false);
    expect(ClaimExtractionSchema.safeParse({ claims: [{ text: "A", excerpt: "x", evidence: [] }] }).success).toBe(false);
    expect(ClaimExtractionSchema.safeParse({ claims: [{ text: "A", excerpt: "x", topic: "T" }] }).success).toBe(false);
  });

  it("rejects a payload without a claims array", () => {
    expect(ClaimExtractionSchema.safeParse({}).success).toBe(false);
  });
});
