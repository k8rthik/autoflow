import type { FlowEvent } from "./events.ts";
import { getArgument, getClaim, rowOf } from "./lookup.ts";
import { mapValues, withoutKey } from "./records.ts";
import { andThen, err, ok, type Result } from "./result.ts";
import type { Argument, ArgumentId, ClaimId, FlowState } from "./types.ts";

type Of<T extends FlowEvent["type"]> = Extract<FlowEvent, { type: T }>;

/** Every argument whose arrow points at `from` now points at `to`. */
const repointDependents = (state: FlowState, from: ArgumentId, to: ArgumentId | null): FlowState => ({
  ...state,
  arguments: mapValues(state.arguments, (a) => (a.respondsTo === from ? { ...a, respondsTo: to } : a)),
});

const withArgument = (state: FlowState, argument: Argument): FlowState => ({
  ...state,
  arguments: { ...state.arguments, [argument.id]: argument },
});

const withRow = (state: FlowState, claimId: ClaimId, row: readonly ArgumentId[]): FlowState => ({
  ...state,
  rows: { ...state.rows, [claimId]: row },
});

/** An arrow may point at the claim (`null`) or at an argument on the same row. */
const checkArrowTarget = (state: FlowState, claimId: ClaimId, respondsTo: ArgumentId | null): Result<null> => {
  if (respondsTo === null) return ok(null);
  return andThen(getArgument(state, respondsTo), (target) =>
    target.claimId === claimId
      ? ok(null)
      : err("ARROW_CROSSES_ROWS", `Argument "${respondsTo}" is on claim "${target.claimId}", not "${claimId}"`),
  );
};

export const argumentAdded = (state: FlowState, { argument }: Of<"ArgumentAdded">): Result<FlowState> => {
  if (state.arguments[argument.id]) return err("ARGUMENT_EXISTS", `Argument "${argument.id}" already exists`);
  return andThen(getClaim(state, argument.claimId), () =>
    andThen(checkArrowTarget(state, argument.claimId, argument.respondsTo), () =>
      ok(withRow(withArgument(state, argument), argument.claimId, [...rowOf(state, argument.claimId), argument.id])),
    ),
  );
};

export const argumentEdited = (state: FlowState, { argumentId, text }: Of<"ArgumentEdited">): Result<FlowState> =>
  andThen(getArgument(state, argumentId), (a) => ok(withArgument(state, { ...a, text })));

export const argumentRestanced = (state: FlowState, { argumentId, stance }: Of<"ArgumentRestanced">): Result<FlowState> =>
  andThen(getArgument(state, argumentId), (a) => ok(withArgument(state, { ...a, stance })));

/**
 * Moves an argument to the end of another row. Its own arrow resets to the claim, and
 * anything that answered it now answers what it answered, so the old row's chain stays intact.
 */
export const argumentMoved = (state: FlowState, { argumentId, toClaimId }: Of<"ArgumentMoved">): Result<FlowState> =>
  andThen(getArgument(state, argumentId), (a) =>
    andThen(getClaim(state, toClaimId), () => {
      if (a.claimId === toClaimId) return ok(state);
      const spliced = repointDependents(state, a.id, a.respondsTo);
      const oldRow = rowOf(state, a.claimId).filter((id) => id !== a.id);
      const newRow = [...rowOf(state, toClaimId), a.id];
      const moved = withArgument(spliced, { ...a, claimId: toClaimId, respondsTo: null });
      return ok(withRow(withRow(moved, a.claimId, oldRow), toClaimId, newRow));
    }),
  );

/** Arrows only point backward along the row: the target must come earlier in the sequence. */
export const arrowRepointed = (state: FlowState, { argumentId, respondsTo }: Of<"ArrowRepointed">): Result<FlowState> =>
  andThen(getArgument(state, argumentId), (a) =>
    andThen(checkArrowTarget(state, a.claimId, respondsTo), () => {
      const row = rowOf(state, a.claimId);
      const pointsForward = respondsTo !== null && row.indexOf(respondsTo) >= row.indexOf(a.id);
      if (pointsForward) {
        return err("ARROW_POINTS_FORWARD", `Argument "${a.id}" cannot answer "${respondsTo}", which comes after it`);
      }
      return ok(withArgument(state, { ...a, respondsTo }));
    }),
  );

/**
 * Two cards that are the same point become one. The kept argument takes the earlier
 * position and the earlier arrow, so every remaining arrow still points backward.
 */
export const argumentsMerged = (state: FlowState, { keep, drop }: Of<"ArgumentsMerged">): Result<FlowState> => {
  if (keep === drop) return err("INVALID_MERGE", `Cannot merge argument "${keep}" with itself`);
  return andThen(getArgument(state, keep), (kept) =>
    andThen(getArgument(state, drop), (dropped) => {
      if (kept.claimId !== dropped.claimId) {
        return err("INVALID_MERGE", `Arguments "${keep}" and "${drop}" are on different rows`);
      }
      const row = rowOf(state, kept.claimId);
      const keptIsEarlier = row.indexOf(keep) < row.indexOf(drop);
      const earlier = keptIsEarlier ? kept : dropped;
      const merged: Argument = { ...kept, respondsTo: earlier.respondsTo };
      const newRow = row.filter((id) => id !== (keptIsEarlier ? drop : keep)).map((id) => (id === drop ? keep : id));
      const repointed = repointDependents(state, drop, keep);
      const withoutDropped: FlowState = { ...repointed, arguments: withoutKey(repointed.arguments, drop) };
      return ok(withRow(withArgument(withoutDropped, merged), kept.claimId, newRow));
    }),
  );
};

/** "That was not an argument." Dependents are re-pointed to what it answered. */
export const argumentRemoved = (state: FlowState, { argumentId }: Of<"ArgumentRemoved">): Result<FlowState> =>
  andThen(getArgument(state, argumentId), (a) => {
    const repointed = repointDependents(state, a.id, a.respondsTo);
    const row = rowOf(state, a.claimId).filter((id) => id !== a.id);
    return ok(withRow({ ...repointed, arguments: withoutKey(repointed.arguments, a.id) }, a.claimId, row));
  });
