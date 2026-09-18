import { emptyFlow, reduce, type Argument, type Claim, type FlowEvent, type FlowState, type Provenance, type RecordedEvent, type Stance } from "@autoflow/core";
import { vi } from "vitest";
import type { ApplyEvent } from "../src/lib/apply.ts";
import type { SessionDoc } from "../src/lib/session-doc.ts";

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

/** Wraps bare events as the server would record them, so components see what they see in the room. */
export const recorded = (events: readonly FlowEvent[], actor: RecordedEvent["actor"] = "import"): readonly RecordedEvent[] =>
  events.map((event, i) => ({ seq: i + 1, at: `2026-09-18T10:0${i}:00.000Z`, actor, event }));

export const sessionDoc = (events: readonly FlowEvent[], title = "Larkspur"): SessionDoc => ({
  session: { id: "s1", title, createdAt: "2026-09-18T10:00:00.000Z" },
  events: recorded(events),
});

/** An apply that the server always accepts. */
export const acceptingApply = () => vi.fn<ApplyEvent>().mockResolvedValue(null);

/** An apply the server refuses, with the reason it gives. */
export const refusingApply = (reason: string) => vi.fn<ApplyEvent>().mockResolvedValue(reason);
