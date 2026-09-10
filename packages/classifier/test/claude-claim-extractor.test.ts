import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { CLAIM_EXTRACTION_SYSTEM_PROMPT, createClaudeClaimExtractor } from "../src/index.ts";

type ParseResponse = {
  parsed_output: unknown;
  stop_reason: string;
  stop_details?: unknown;
  model?: string;
  usage?: { input_tokens: number; output_tokens: number };
};

const fakeClient = (impl: () => Promise<ParseResponse>) => {
  const parse = vi.fn((_request: unknown) => impl());
  const client = { messages: { parse } } as unknown as Anthropic;
  return { client, parse };
};

const good: ParseResponse = {
  parsed_output: { claims: [{ text: "Market is large", excerpt: "TAM of $40B" }] },
  stop_reason: "end_turn",
  model: "claude-opus-5",
  usage: { input_tokens: 120, output_tokens: 30 },
};

describe("createClaudeClaimExtractor", () => {
  it("returns the parsed claims and call metadata on success", async () => {
    const { client } = fakeClient(async () => good);
    const result = await createClaudeClaimExtractor({ client }).extractClaims("memo text");
    expect(result).toMatchObject({
      ok: true,
      claims: [{ text: "Market is large", excerpt: "TAM of $40B" }],
      meta: { model: "claude-opus-5", inputTokens: 120, outputTokens: 30, stopReason: "end_turn" },
    });
    if (result.ok) expect(result.meta.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("sends the memo as the user message with the fixed system prompt and default model", async () => {
    const { client, parse } = fakeClient(async () => good);
    await createClaudeClaimExtractor({ client }).extractClaims("memo text");
    expect(parse).toHaveBeenCalledOnce();
    const request = parse.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(request["model"]).toBe("claude-haiku-4-5");
    expect(request["system"]).toBe(CLAIM_EXTRACTION_SYSTEM_PROMPT);
    expect(request["messages"]).toEqual([{ role: "user", content: "memo text" }]);
  });

  it("honours a model override", async () => {
    const { client, parse } = fakeClient(async () => good);
    await createClaudeClaimExtractor({ client, model: "claude-sonnet-5" }).extractClaims("memo");
    expect((parse.mock.calls[0]?.[0] as Record<string, unknown>)["model"]).toBe("claude-sonnet-5");
  });

  it("rejects an empty memo without calling the API", async () => {
    const { client, parse } = fakeClient(async () => good);
    const result = await createClaudeClaimExtractor({ client }).extractClaims("   \n ");
    expect(result).toMatchObject({ ok: false, error: { code: "EMPTY_MEMO" } });
    expect(parse).not.toHaveBeenCalled();
  });

  it("reports a refusal", async () => {
    const { client } = fakeClient(async () => ({
      parsed_output: null,
      stop_reason: "refusal",
      stop_details: { type: "refusal", category: null, explanation: "nope" },
    }));
    const result = await createClaudeClaimExtractor({ client }).extractClaims("memo");
    expect(result).toMatchObject({ ok: false, error: { code: "REFUSED" } });
  });

  it("reports output that did not parse", async () => {
    const { client } = fakeClient(async () => ({ parsed_output: null, stop_reason: "end_turn" }));
    const result = await createClaudeClaimExtractor({ client }).extractClaims("memo");
    expect(result).toMatchObject({ ok: false, error: { code: "UNPARSEABLE" } });
  });

  it("reports when the model found no claims", async () => {
    const { client } = fakeClient(async () => ({ parsed_output: { claims: [] }, stop_reason: "end_turn" }));
    const result = await createClaudeClaimExtractor({ client }).extractClaims("memo");
    expect(result).toMatchObject({ ok: false, error: { code: "NO_CLAIMS" } });
  });

  it("wraps SDK errors with their status", async () => {
    const { client } = fakeClient(async () => {
      throw new Anthropic.RateLimitError(429, { type: "rate_limit_error" }, "slow down", new Headers());
    });
    const result = await createClaudeClaimExtractor({ client }).extractClaims("memo");
    expect(result).toMatchObject({ ok: false, error: { code: "API_ERROR" } });
    if (!result.ok) expect(result.error.message).toMatch(/429/);
  });

  it("re-throws errors that are not from the SDK", async () => {
    const { client } = fakeClient(async () => {
      throw new TypeError("bug");
    });
    await expect(createClaudeClaimExtractor({ client }).extractClaims("memo")).rejects.toThrow(TypeError);
  });
});
