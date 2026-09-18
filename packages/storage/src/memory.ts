import type { RecordedEvent } from "@autoflow/core";
import type { AppendInput, EventStore, Session, StorageResult } from "./types.ts";
import { sessionExists, sessionNotFound, staleWrite } from "./errors.ts";

interface Log {
  readonly session: Session;
  /** Insertion order, so a listing is stable when two sessions share a timestamp. */
  readonly ordinal: number;
  readonly events: readonly RecordedEvent[];
}

const lastSeq = (events: readonly RecordedEvent[]): number => events.at(-1)?.seq ?? 0;

/**
 * Keeps the log in memory. Used by the server's tests and by anything that wants a throwaway
 * session; it satisfies the same contract as the SQLite adapter and nothing else can tell them apart.
 */
export const createMemoryEventStore = (): EventStore => {
  const logs = new Map<string, Log>();
  let created = 0;

  return {
    createSession: async ({ id, title }): Promise<StorageResult<Session>> => {
      if (logs.has(id)) return sessionExists(id);
      const session: Session = { id, title, createdAt: new Date().toISOString() };
      logs.set(id, { session, ordinal: created++, events: [] });
      return { ok: true, value: session };
    },

    getSession: async (id) => {
      const log = logs.get(id);
      return log ? { ok: true, value: log.session } : sessionNotFound(id);
    },

    listSessions: async () =>
      [...logs.values()]
        .toSorted((a, b) => b.session.createdAt.localeCompare(a.session.createdAt) || b.ordinal - a.ordinal)
        .map((log) => log.session),

    append: async ({ sessionId, events, actor, expectedSeq }: AppendInput) => {
      const log = logs.get(sessionId);
      if (!log) return sessionNotFound(sessionId);

      const currentSeq = lastSeq(log.events);
      if (expectedSeq !== undefined && expectedSeq !== currentSeq) return staleWrite(currentSeq);

      const at = new Date().toISOString();
      const recorded = events.map((event, i) => ({ seq: currentSeq + i + 1, at, actor, event }) satisfies RecordedEvent);
      logs.set(sessionId, { ...log, events: [...log.events, ...recorded] });
      return { ok: true, value: recorded };
    },

    readEvents: async (sessionId, afterSeq = 0) => {
      const log = logs.get(sessionId);
      if (!log) return sessionNotFound(sessionId);
      return { ok: true, value: log.events.filter((e) => e.seq > afterSeq) };
    },

    close: () => logs.clear(),
  };
};
