/**
 * Two tables, per architecture §3. `events` is append-only: rows are never updated or deleted, and
 * (session_id, seq) is the log position. Payloads are stored as JSON because the domain owns the
 * event shape — teaching SQL about eleven event types would put domain rules in the adapter.
 */
export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    created_at  TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS events (
    session_id  TEXT NOT NULL REFERENCES sessions(id),
    seq         INTEGER NOT NULL,
    at          TEXT NOT NULL,
    actor       TEXT NOT NULL,
    payload     TEXT NOT NULL,
    PRIMARY KEY (session_id, seq)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS events_by_session ON events (session_id, seq);
`;
