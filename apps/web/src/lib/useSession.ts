import type { FlowEvent, FlowState, RecordedEvent } from "@autoflow/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { submitEvents } from "./api.ts";
import { connectLive } from "./live.ts";
import { lastSeq, mergeEvents, projectSession, type SessionDoc } from "./session-doc.ts";

export interface SessionActions {
  /** Sends a correction. Resolves with an error message when the server refuses it, else null. */
  readonly apply: (event: FlowEvent) => Promise<string | null>;
  readonly leave: () => void;
}

export interface SessionView {
  readonly doc: SessionDoc;
  readonly state: FlowState;
  readonly actions: SessionActions;
}

/**
 * Holds one session. The server owns the log, so nothing is applied locally until it comes back
 * committed — either in the reply to our own submission or pushed over the live socket, whichever
 * arrives first. That is what keeps two people correcting the same row from diverging.
 */
export const useSession = (initial: SessionDoc, onLeave: () => void): SessionView => {
  const [doc, setDoc] = useState<SessionDoc>(initial);
  const state = useMemo(() => projectSession(doc), [doc]);
  const sessionId = doc.session.id;

  const receive = useCallback((events: readonly RecordedEvent[]) => setDoc((current) => mergeEvents(current, events)), []);

  useEffect(() => {
    const live = connectLive(sessionId, (message) => {
      if (message.type === "events") receive(message.events);
    });
    return () => live.close();
  }, [sessionId, receive]);

  const apply = useCallback(
    async (event: FlowEvent): Promise<string | null> => {
      const result = await submitEvents(sessionId, [event]);
      if (!result.ok) return result.error.message;
      receive(result.value.events);
      return null;
    },
    [sessionId, receive],
  );

  const actions = useMemo<SessionActions>(() => ({ apply, leave: onLeave }), [apply, onLeave]);

  return { doc, state, actions };
};

export { lastSeq };
