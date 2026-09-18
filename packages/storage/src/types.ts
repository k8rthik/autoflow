import type { Actor, FlowEvent, RecordedEvent } from "@autoflow/core";

/** One discussion. The memo title is carried here so a session list reads usefully without replaying logs. */
export interface Session {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
}

export type StorageErrorCode = "SESSION_NOT_FOUND" | "SESSION_EXISTS" | "STALE_WRITE";

export interface StorageError {
  readonly code: StorageErrorCode;
  readonly message: string;
  /** On STALE_WRITE: the sequence the log is actually at, so the caller can catch up. */
  readonly currentSeq?: number;
}

export type StorageResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: StorageError };

export interface AppendInput {
  readonly sessionId: string;
  readonly events: readonly FlowEvent[];
  readonly actor: Actor;
  /**
   * The sequence the caller validated against. The append is refused if the log has moved on,
   * so two clients cannot both append against the same state and produce an unreplayable log.
   * Omit to append unconditionally.
   */
  readonly expectedSeq?: number;
}

/**
 * Persistence port for the append-only log. Deliberately free of domain rules: validating an
 * event against the current flow is the session hub's job, and this only stores what it is given.
 */
export interface EventStore {
  createSession(session: { readonly id: string; readonly title: string }): Promise<StorageResult<Session>>;
  getSession(id: string): Promise<StorageResult<Session>>;
  listSessions(): Promise<readonly Session[]>;
  /** Appends in order and returns the events as recorded, with their assigned sequences. */
  append(input: AppendInput): Promise<StorageResult<readonly RecordedEvent[]>>;
  /** The log in sequence order. `afterSeq` returns only what came later, for catching a client up. */
  readEvents(sessionId: string, afterSeq?: number): Promise<StorageResult<readonly RecordedEvent[]>>;
  close(): void;
}
