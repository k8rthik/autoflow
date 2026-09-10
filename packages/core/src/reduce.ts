import type { FlowEvent } from "./events.ts";
import {
  argumentAdded,
  argumentEdited,
  argumentMoved,
  argumentRemoved,
  argumentRestanced,
  argumentsMerged,
  arrowRepointed,
} from "./reduce-arguments.ts";
import { claimAdded, claimRemoved, claimRenamed, claimsMerged } from "./reduce-claims.ts";
import type { Result } from "./result.ts";
import type { FlowState } from "./types.ts";

/**
 * Applies one event to a flow, returning a new flow. Never mutates its input.
 * A failed result means the event violated an invariant and must not be appended to the log.
 */
export const reduce = (state: FlowState, event: FlowEvent): Result<FlowState> => {
  switch (event.type) {
    case "ClaimAdded":
      return claimAdded(state, event);
    case "ClaimRenamed":
      return claimRenamed(state, event);
    case "ClaimRemoved":
      return claimRemoved(state, event);
    case "ClaimsMerged":
      return claimsMerged(state, event);
    case "ArgumentAdded":
      return argumentAdded(state, event);
    case "ArgumentEdited":
      return argumentEdited(state, event);
    case "ArgumentMoved":
      return argumentMoved(state, event);
    case "ArgumentRestanced":
      return argumentRestanced(state, event);
    case "ArrowRepointed":
      return arrowRepointed(state, event);
    case "ArgumentsMerged":
      return argumentsMerged(state, event);
    case "ArgumentRemoved":
      return argumentRemoved(state, event);
  }
};
