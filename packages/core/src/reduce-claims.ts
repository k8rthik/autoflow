import type { FlowEvent } from "./events.ts";
import { getClaim } from "./lookup.ts";
import { mapValues, withoutKey, withoutKeys } from "./records.ts";
import { andThen, err, ok, type Result } from "./result.ts";
import type { FlowState } from "./types.ts";

type Of<T extends FlowEvent["type"]> = Extract<FlowEvent, { type: T }>;

export const claimAdded = (state: FlowState, { claim }: Of<"ClaimAdded">): Result<FlowState> => {
  if (state.claims[claim.id]) return err("CLAIM_EXISTS", `Claim "${claim.id}" already exists`);
  return ok({
    ...state,
    claims: { ...state.claims, [claim.id]: claim },
    rows: { ...state.rows, [claim.id]: [] },
  });
};

export const claimRenamed = (state: FlowState, { claimId, text }: Of<"ClaimRenamed">): Result<FlowState> =>
  andThen(getClaim(state, claimId), (claim) =>
    ok({ ...state, claims: { ...state.claims, [claimId]: { ...claim, text } } }),
  );

export const claimRemoved = (state: FlowState, { claimId }: Of<"ClaimRemoved">): Result<FlowState> =>
  andThen(getClaim(state, claimId), () => {
    const removed = new Set(state.rows[claimId] ?? []);
    return ok({
      claims: withoutKey(state.claims, claimId),
      arguments: withoutKeys(state.arguments, removed),
      rows: withoutKey(state.rows, claimId),
    });
  });

export const claimsMerged = (state: FlowState, { into, from }: Of<"ClaimsMerged">): Result<FlowState> => {
  if (into === from) return err("INVALID_MERGE", `Cannot merge claim "${into}" into itself`);
  return andThen(getClaim(state, into), () =>
    andThen(getClaim(state, from), () => {
      const mergedRow = [...(state.rows[into] ?? []), ...(state.rows[from] ?? [])];
      return ok({
        claims: withoutKey(state.claims, from),
        arguments: mapValues(state.arguments, (a) => (a.claimId === from ? { ...a, claimId: into } : a)),
        rows: { ...withoutKey(state.rows, from), [into]: mergedRow },
      });
    }),
  );
};
