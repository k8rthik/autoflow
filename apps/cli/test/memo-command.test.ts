import { sequentialIds, type ClaimExtractor } from "@autoflow/classifier";
import { describe, expect, it } from "vitest";
import { runMemoCommand } from "../src/memo-command.ts";

const meta = { model: "fake", inputTokens: 0, outputTokens: 0, latencyMs: 0, stopReason: "end_turn" };

const extractorReturning = (claims: { text: string; excerpt: string }[]): ClaimExtractor => ({
  extractClaims: async () => ({ ok: true, claims, meta }),
});

describe("runMemoCommand", () => {
  it("turns extracted claims into an event log and a rendered flow", async () => {
    const extractor = extractorReturning([
      { text: "Market is large", excerpt: "x" },
      { text: "Team is strong", excerpt: "y" },
    ]);
    const result = await runMemoCommand({ memoText: "memo", extractor, makeId: sequentialIds("c") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.events).toHaveLength(2);
    expect(Object.keys(result.value.state.claims)).toEqual(["c1", "c2"]);
    expect(result.value.text).toContain("Market is large");
    expect(result.value.markdown).toContain("## 2. Team is strong");
  });

  it("passes extraction failures through", async () => {
    const extractor: ClaimExtractor = {
      extractClaims: async () => ({ ok: false, error: { code: "REFUSED", message: "no" } }),
    };
    const result = await runMemoCommand({ memoText: "memo", extractor, makeId: sequentialIds("c") });
    expect(result).toEqual({ ok: false, error: { code: "REFUSED", message: "no" } });
  });
});
