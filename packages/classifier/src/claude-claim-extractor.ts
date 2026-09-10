import Anthropic, { APIError } from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CLAIM_EXTRACTION_SYSTEM_PROMPT } from "./prompt.ts";
import { ClaimExtractionSchema } from "./schema.ts";
import type { ClaimExtractor, ExtractionError, ExtractionMeta, ExtractionResult } from "./types.ts";

/** Chosen by eval (docs/model-eval-2026-09-10.md): highest precision, no leaks, fastest of the accurate models. */
export const DEFAULT_CLAIM_EXTRACTION_MODEL = "claude-haiku-4-5";
const MAX_OUTPUT_TOKENS = 16000;

export interface ClaudeClaimExtractorOptions {
  readonly client: Anthropic;
  readonly model?: string;
}

const fail = (code: ExtractionError["code"], message: string): ExtractionResult => ({ ok: false, error: { code, message } });

const describeApiError = (error: APIError): string =>
  error.status ? `Claude API error ${error.status}: ${error.message}` : `Claude API error: ${error.message}`;

/** Claude adapter for the ClaimExtractor port. Structured output is validated against the Zod schema by the SDK. */
export const createClaudeClaimExtractor = ({
  client,
  model = DEFAULT_CLAIM_EXTRACTION_MODEL,
}: ClaudeClaimExtractorOptions): ClaimExtractor => ({
  async extractClaims(memo) {
    if (memo.trim() === "") return fail("EMPTY_MEMO", "The memo is empty");

    const startedAt = performance.now();
    try {
      const response = await client.messages.parse({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: CLAIM_EXTRACTION_SYSTEM_PROMPT,
        messages: [{ role: "user", content: memo }],
        output_config: { format: zodOutputFormat(ClaimExtractionSchema) },
      });

      if (response.stop_reason === "refusal") {
        const explanation = response.stop_details?.explanation ?? "no explanation given";
        return fail("REFUSED", `Claude declined to process the memo: ${explanation}`);
      }
      if (!response.parsed_output) return fail("UNPARSEABLE", "Claude's response did not match the claim schema");
      if (response.parsed_output.claims.length === 0) return fail("NO_CLAIMS", "Claude found no claims in the memo");

      const meta: ExtractionMeta = {
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        latencyMs: Math.round(performance.now() - startedAt),
        stopReason: response.stop_reason,
      };
      return { ok: true, claims: response.parsed_output.claims, meta };
    } catch (error) {
      if (error instanceof APIError) return fail("API_ERROR", describeApiError(error));
      throw error;
    }
  },
});
