import { err, ok, type Result } from "./result.ts";
import type { Argument, ArgumentId, Claim, ClaimId, FlowState } from "./types.ts";

export const getClaim = (state: FlowState, id: ClaimId): Result<Claim> => {
  const claim = state.claims[id];
  return claim ? ok(claim) : err("CLAIM_NOT_FOUND", `No claim with id "${id}"`);
};

export const getArgument = (state: FlowState, id: ArgumentId): Result<Argument> => {
  const argument = state.arguments[id];
  return argument ? ok(argument) : err("ARGUMENT_NOT_FOUND", `No argument with id "${id}"`);
};

/** The row for a claim. Callers must have checked the claim exists. */
export const rowOf = (state: FlowState, claimId: ClaimId): readonly ArgumentId[] => state.rows[claimId] ?? [];

/** Like `state.arguments[id]` but for code paths where absence is an invariant violation. */
export const argumentOrThrow = (state: FlowState, id: ArgumentId): Argument => {
  const argument = state.arguments[id];
  if (!argument) throw new Error(`Flow invariant violated: row references missing argument "${id}"`);
  return argument;
};
