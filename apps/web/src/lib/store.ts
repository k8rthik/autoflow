import { emptyFlow, reduce, replay, type FlowEvent, type FlowState, type Result } from "@autoflow/core";

/** Everything the browser keeps: the memo title and the append-only event log. State is always replayed from it. */
export interface FlowDoc {
  readonly title: string;
  readonly events: readonly FlowEvent[];
}

export const emptyDoc = (): FlowDoc => ({ title: "", events: [] });

export const hasFlow = (doc: FlowDoc): boolean => doc.events.length > 0;

/** Replays the log. A log that fails to replay is corrupt; callers fall back to an empty flow and say so. */
export const projectDoc = (doc: FlowDoc): FlowState => {
  const result = replay(doc.events);
  return result.ok ? result.value : emptyFlow();
};

/** Validates the event against the current state before appending it, so the log never holds an invalid event. */
export const applyEvent = (doc: FlowDoc, state: FlowState, event: FlowEvent): Result<FlowDoc> => {
  const next = reduce(state, event);
  return next.ok ? { ok: true, value: { ...doc, events: [...doc.events, event] } } : next;
};

export const undoLast = (doc: FlowDoc): FlowDoc => ({ ...doc, events: doc.events.slice(0, -1) });

export const encodeDoc = (doc: FlowDoc): string => JSON.stringify(doc);

/** Accepts only a document whose log replays cleanly; anything else is treated as absent. */
export const decodeDoc = (raw: string | null): FlowDoc | null => {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { title, events } = parsed as { title?: unknown; events?: unknown };
    if (typeof title !== "string" || !Array.isArray(events)) return null;
    const doc: FlowDoc = { title, events: events as FlowEvent[] };
    return replay(doc.events).ok ? doc : null;
  } catch {
    return null;
  }
};
