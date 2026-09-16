/** A fact, number or figure the memo offers in support of a claim. Becomes a support argument on the row. */
export interface ExtractedEvidence {
  readonly text: string;
  readonly excerpt: string;
}

/** A claim the extractor found in a memo, with its section and the evidence the memo gives for it. */
export interface ExtractedClaim {
  readonly text: string;
  /** Short verbatim excerpt from the memo that supports linking back to the source. */
  readonly excerpt: string;
  /** Memo section the claim belongs to, e.g. "Market". Empty when the memo has no usable structure. */
  readonly topic: string;
  readonly evidence: readonly ExtractedEvidence[];
}

export type ExtractionErrorCode = "EMPTY_MEMO" | "REFUSED" | "TRUNCATED" | "UNPARSEABLE" | "NO_CLAIMS" | "API_ERROR";

export interface ExtractionError {
  readonly code: ExtractionErrorCode;
  readonly message: string;
}

export type FigureMediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

/** An image from the memo, referenced in the markdown as `![Figure n](figure:n)`. Base64, no data-URI prefix. */
export interface MemoFigure {
  readonly index: number;
  readonly mediaType: FigureMediaType;
  readonly data: string;
}

/** A memo as the extractor sees it: markdown (tables included) plus the figures it references. */
export interface MemoInput {
  readonly markdown: string;
  readonly figures: readonly MemoFigure[];
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
  extractClaims(memo: string | MemoInput): Promise<ExtractionResult>;
}

/** Produces a fresh id on each call. */
export type IdFactory = () => string;
