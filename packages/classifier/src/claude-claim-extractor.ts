import Anthropic, { APIError } from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ClaimExtraction } from "./schema.ts";
import { buildMemoContent, toMemoInput } from "./memo-content.ts";
import { CLAIM_EXTRACTION_SYSTEM_PROMPT } from "./prompt.ts";
import { ClaimExtractionSchema } from "./schema.ts";
import type { ClaimExtractor, ExtractionError, ExtractionMeta, ExtractionResult } from "./types.ts";

/** See docs/model-eval-2026-09-10.md: the smallest model that reliably nests evidence under claims. */
export const DEFAULT_CLAIM_EXTRACTION_MODEL = "claude-sonnet-5";
/** Thinking tokens count against this on models that think, so leave room for a long memo's worth of claims. */
const MAX_OUTPUT_TOKENS = 32000;

export interface ClaudeClaimExtractorOptions {
  readonly client: Anthropic;
  readonly model?: string;
}

const fail = (code: ExtractionError["code"], message: string): ExtractionResult => ({ ok: false, error: { code, message } });

const describeApiError = (error: APIError): string =>
  error.status ? `Claude API error ${error.status}: ${error.message}` : `Claude API error: ${error.message}`;

/** The model's answer is the JSON in its text blocks; validate it against the same schema the request declared. */
const parseClaims = (response: Anthropic.Message): ClaimExtraction | null => {
  const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
  try {
    const parsed = ClaimExtractionSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

/**
 * Claude adapter for the ClaimExtractor port. Streams so long memos on thinking models never hit the
 * non-streaming request ceiling; structured output is requested via the Zod schema and validated on receipt.
 */
export const createClaudeClaimExtractor = ({
  client,
  model = DEFAULT_CLAIM_EXTRACTION_MODEL,
}: ClaudeClaimExtractorOptions): ClaimExtractor => ({
  async extractClaims(rawMemo) {
    const memo = toMemoInput(rawMemo);
    if (memo.markdown.trim() === "") return fail("EMPTY_MEMO", "The memo is empty");

    const startedAt = performance.now();
    try {
      const response = await client.messages
        .stream({
          model,
          max_tokens: MAX_OUTPUT_TOKENS,
          system: CLAIM_EXTRACTION_SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildMemoContent(memo) }],
          output_config: { format: zodOutputFormat(ClaimExtractionSchema) },
        })
        .finalMessage();
      const parsed = parseClaims(response);

      if (response.stop_reason === "refusal") {
        const explanation = response.stop_details?.explanation ?? "no explanation given";
        return fail("REFUSED", `Claude declined to process the memo: ${explanation}`);
      }
      if (response.stop_reason === "max_tokens") {
        return fail("TRUNCATED", `The model ran out of output tokens (${response.usage.output_tokens}) before finishing the claim list`);
      }
      if (!parsed) {
        return fail("UNPARSEABLE", `The model's response did not match the claim schema (stop reason: ${response.stop_reason ?? "unknown"})`);
      }
      if (parsed.claims.length === 0) return fail("NO_CLAIMS", "Claude found no claims in the memo");

      const meta: ExtractionMeta = {
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        latencyMs: Math.round(performance.now() - startedAt),
        stopReason: response.stop_reason,
      };
      return { ok: true, claims: parsed.claims, meta };
    } catch (error) {
      if (error instanceof APIError) return fail("API_ERROR", describeApiError(error));
      throw error;
    }
  },
});
