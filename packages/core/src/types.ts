/**
 * Domain vocabulary. See docs/requirements.md §2 for the concepts these encode.
 * Everything here is immutable; new states are produced only by `reduce`.
 */

export type ClaimId = string;
export type ArgumentId = string;

/** How an argument relates to what it responds to. */
export type Stance = "support" | "attack" | "question";

/**
 * Derived state of a claim. See docs/requirements.md §4.5: `untested` marks a row nobody
 * has engaged with, which is deliberately distinct from a row standing supported after debate.
 */
export type Status = "supported" | "contested" | "open" | "untested";

/** Where an argument came from. */
export type Provenance = "memo" | "prelim" | "live" | "manual";

export interface Claim {
  readonly id: ClaimId;
  readonly text: string;
  /** Position in the memo's structure. Rows are displayed in this order. */
  readonly order: number;
  /** The memo section the claim comes from (Market, Team, ...). Rows are grouped under it. */
  readonly topic?: string;
}

export interface Argument {
  readonly id: ArgumentId;
  readonly claimId: ClaimId;
  readonly text: string;
  readonly stance: Stance;
  /** The argument this one answers, or `null` when it answers the claim directly. */
  readonly respondsTo: ArgumentId | null;
  readonly source: Provenance;
  /** Ids of transcript segments or prelim passages this argument was drawn from. */
  readonly sourceRefs: readonly string[];
}

export interface FlowState {
  readonly claims: Readonly<Record<ClaimId, Claim>>;
  readonly arguments: Readonly<Record<ArgumentId, Argument>>;
  /** Per-claim row sequence: argument ids in the order they were made. */
  readonly rows: Readonly<Record<ClaimId, readonly ArgumentId[]>>;
}

export const emptyFlow = (): FlowState => ({ claims: {}, arguments: {}, rows: {} });
