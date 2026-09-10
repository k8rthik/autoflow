/** A claim the extractor found in a memo, with the passage it came from. */
export interface ExtractedClaim {
  readonly text: string;
  /** Short verbatim excerpt from the memo that supports linking back to the source. */
  readonly excerpt: string;
}

export type ExtractionErrorCode = "EMPTY_MEMO" | "REFUSED" | "UNPARSEABLE" | "NO_CLAIMS" | "API_ERROR";

export interface ExtractionError {
  readonly code: ExtractionErrorCode;
  readonly message: string;
}

/** Observability for one extraction call: what served it and what it cost. */
export interface ExtractionMeta {
  /** Model id reported by the provider; compare against the requested id to catch silent substitution. */
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly latencyMs: number;
  readonly stopReason: string | null;
}

export type ExtractionResult =
  | { readonly ok: true; readonly claims: readonly ExtractedClaim[]; readonly meta: ExtractionMeta }
  | { readonly ok: false; readonly error: ExtractionError };

/**
 * Port: anything that can turn a memo into claims. The Claude adapter implements it;
 * tests use fakes. Requirements §4.1.
 */
export interface ClaimExtractor {
  extractClaims(memo: string): Promise<ExtractionResult>;
}

/** Produces a fresh id on each call. */
export type IdFactory = () => string;
