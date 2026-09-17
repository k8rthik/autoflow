import { emptyFlow, reduce, type Argument, type Claim, type FlowEvent, type FlowState, type Provenance, type Stance } from "@autoflow/core";

export const claim = (id: string, text: string, order: number, topic?: string): Claim => ({
  id,
  text,
  order,
  ...(topic === undefined ? {} : { topic }),
});

export const argument = (
  id: string,
  claimId: string,
  text: string,
  stance: Stance,
  respondsTo: string | null = null,
  source: Provenance = "manual",
): Argument => ({ id, claimId, text, stance, respondsTo, source, sourceRefs: [] });

export const claimAdded = (c: Claim): FlowEvent => ({ type: "ClaimAdded", claim: c });
export const argumentAdded = (a: Argument): FlowEvent => ({ type: "ArgumentAdded", argument: a });

/** Folds events into a state, failing loudly so a broken fixture never looks like a broken component. */
export const build = (events: readonly FlowEvent[]): FlowState =>
  events.reduce<FlowState>((state, event) => {
    const next = reduce(state, event);
    if (!next.ok) throw new Error(`Fixture event ${event.type} rejected: ${next.error.message}`);
    return next.value;
  }, emptyFlow());
