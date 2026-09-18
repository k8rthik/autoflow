import type { Actor, FlowEvent, RecordedEvent } from "@autoflow/core";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { sessionExists, sessionNotFound, staleWrite } from "./errors.ts";
import { SCHEMA } from "./schema.ts";
import type { AppendInput, EventStore, Session, StorageResult } from "./types.ts";

const IN_MEMORY = ":memory:";

interface SessionRow {
  readonly id: string;
  readonly title: string;
  readonly created_at: string;
}

interface EventRow {
  readonly seq: number;
  readonly at: string;
  readonly actor: string;
  readonly payload: string;
}

const toSession = (row: SessionRow): Session => ({ id: row.id, title: row.title, createdAt: row.created_at });

const toRecorded = (row: EventRow): RecordedEvent => ({
  seq: row.seq,
  at: row.at,
  actor: row.actor as Actor,
  event: JSON.parse(row.payload) as FlowEvent,
});

/**
 * The durable adapter: one SQLite file per deployment, backed up alongside the memo.
 *
 * Uses Node's built-in `node:sqlite` rather than Drizzle over a native driver, as architecture §3
 * proposed. Two append-only tables need no query builder or migration tool, and the built-in driver
 * avoids a native build step in CI. It requires Node 24+, which is why the workspace engine moved.
 */
export const createSqliteEventStore = (path: string): EventStore => {
  if (path !== IN_MEMORY) mkdirSync(dirname(path), { recursive: true });

  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);

  const selectSession = db.prepare("SELECT id, title, created_at FROM sessions WHERE id = ?");
  const selectSessions = db.prepare("SELECT id, title, created_at FROM sessions ORDER BY created_at DESC, rowid DESC");
  const insertSession = db.prepare("INSERT INTO sessions (id, title, created_at) VALUES (?, ?, ?)");
  const selectMaxSeq = db.prepare("SELECT COALESCE(MAX(seq), 0) AS seq FROM events WHERE session_id = ?");
  const insertEvent = db.prepare("INSERT INTO events (session_id, seq, at, actor, payload) VALUES (?, ?, ?, ?, ?)");
  const selectEvents = db.prepare("SELECT seq, at, actor, payload FROM events WHERE session_id = ? AND seq > ? ORDER BY seq");

  const findSession = (id: string): SessionRow | undefined => selectSession.get(id) as unknown as SessionRow | undefined;
  const currentSeqOf = (sessionId: string): number => (selectMaxSeq.get(sessionId) as unknown as { seq: number }).seq;

  return {
    createSession: async ({ id, title }): Promise<StorageResult<Session>> => {
      if (findSession(id)) return sessionExists(id);
      const session: Session = { id, title, createdAt: new Date().toISOString() };
      insertSession.run(session.id, session.title, session.createdAt);
      return { ok: true, value: session };
    },

    getSession: async (id) => {
      const row = findSession(id);
      return row ? { ok: true, value: toSession(row) } : sessionNotFound(id);
    },

    listSessions: async () => (selectSessions.all() as unknown as SessionRow[]).map(toSession),

    append: async ({ sessionId, events, actor, expectedSeq }: AppendInput) => {
      if (!findSession(sessionId)) return sessionNotFound(sessionId);

      // The check and the inserts share one transaction, so a concurrent append cannot slip between them.
      db.exec("BEGIN IMMEDIATE");
      try {
        const currentSeq = currentSeqOf(sessionId);
        if (expectedSeq !== undefined && expectedSeq !== currentSeq) {
          db.exec("ROLLBACK");
          return staleWrite(currentSeq);
        }

        const at = new Date().toISOString();
        const recorded = events.map((event, i) => ({ seq: currentSeq + i + 1, at, actor, event }) satisfies RecordedEvent);
        for (const row of recorded) insertEvent.run(sessionId, row.seq, row.at, row.actor, JSON.stringify(row.event));
        db.exec("COMMIT");
        return { ok: true, value: recorded };
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },

    readEvents: async (sessionId, afterSeq = 0) => {
      if (!findSession(sessionId)) return sessionNotFound(sessionId);
      return { ok: true, value: (selectEvents.all(sessionId, afterSeq) as unknown as EventRow[]).map(toRecorded) };
    },

    close: () => db.close(),
  };
};
