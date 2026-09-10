import type { Argument, Claim, FlowEvent, FlowState, Stance } from "../src/index.ts";
import { emptyFlow, reduce } from "../src/index.ts";

export const claim = (id: string, order = 0, text = `claim ${id}`): Claim => ({ id, text, order });

export const arg = (
  id: string,
  claimId: string,
  stance: Stance,
  respondsTo: string | null = null,
  text = `argument ${id}`,
): Argument => ({ id, claimId, text, stance, respondsTo, source: "live", sourceRefs: [] });

/** Applies events in order and throws on the first failure. Test-only convenience. */
export const build = (events: readonly FlowEvent[], initial: FlowState = emptyFlow()): FlowState =>
  events.reduce<FlowState>((state, event) => {
    const result = reduce(state, event);
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    return result.value;
  }, initial);

export const addClaim = (id: string, order = 0): FlowEvent => ({ type: "ClaimAdded", claim: claim(id, order) });

export const addArg = (
  id: string,
  claimId: string,
  stance: Stance,
  respondsTo: string | null = null,
): FlowEvent => ({ type: "ArgumentAdded", argument: arg(id, claimId, stance, respondsTo) });
