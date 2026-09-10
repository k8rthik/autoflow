import { argumentOrThrow } from "./lookup.ts";
import type { ArgumentId, ClaimId, FlowState, Status } from "./types.ts";

export interface RowStatus {
  readonly status: Status;
  /** Arguments nothing later has answered, in row order. */
  readonly standing: readonly ArgumentId[];
  /** Standing attacks and questions: the follow-up list. */
  readonly drops: readonly ArgumentId[];
}

const rank = (hasAttack: boolean, hasQuestion: boolean, rowLength: number): Status => {
  if (hasAttack) return "contested";
  if (hasQuestion) return "open";
  return rowLength > 0 ? "supported" : "untested";
};

/**
 * Derives a claim's status from its row. See docs/architecture.md §4 for the rule:
 * an argument is standing if nothing answers it; a standing attack means contested,
 * else a standing question means open, else supported. No timestamps are involved.
 */
export const statusOf = (state: FlowState, claimId: ClaimId): RowStatus => {
  const row = state.rows[claimId];
  if (!row) throw new Error(`Unknown claim: ${claimId}`);

  const answered = new Set(row.map((id) => argumentOrThrow(state, id).respondsTo).filter((t) => t !== null));
  const standing = row.filter((id) => !answered.has(id));
  const stanceOf = (id: ArgumentId) => argumentOrThrow(state, id).stance;
  const drops = standing.filter((id) => stanceOf(id) !== "support");

  return {
    status: rank(drops.some((id) => stanceOf(id) === "attack"), drops.some((id) => stanceOf(id) === "question"), row.length),
    standing,
    drops,
  };
};

export const statusOfAll = (state: FlowState): Readonly<Record<ClaimId, RowStatus>> =>
  Object.fromEntries(Object.keys(state.claims).map((id) => [id, statusOf(state, id)]));
