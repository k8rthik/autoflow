import { emptyFlow, replay, type FlowState, type RecordedEvent } from "@autoflow/core";
import type { Session } from "./api.ts";

/** What the browser holds: the session it is in and the log as the server has recorded it. */
export interface SessionDoc {
  readonly session: Session;
  readonly events: readonly RecordedEvent[];
}

export const lastSeq = (doc: SessionDoc): number => doc.events.at(-1)?.seq ?? 0;

/** Replays the log. A log that will not replay is a server-side bug; the view falls back to empty. */
export const projectSession = (doc: SessionDoc): FlowState => {
  const result = replay(doc.events.map((e) => e.event));
  return result.ok ? result.value : emptyFlow();
};

/**
 * Folds newly received events in by sequence. The same event can arrive twice — once in the reply
 * to our own POST and once over the live socket — so sequences already held are dropped, and the
 * log is kept sorted whichever order they turn up in.
 */
export const mergeEvents = (doc: SessionDoc, incoming: readonly RecordedEvent[]): SessionDoc => {
  const known = new Set(doc.events.map((e) => e.seq));
  const added = incoming.filter((e) => !known.has(e.seq));
  if (added.length === 0) return doc;
  return { ...doc, events: [...doc.events, ...added].toSorted((a, b) => a.seq - b.seq) };
};
