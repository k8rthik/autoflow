import { emptyFlow, reduce, replay, type Actor, type FlowError, type FlowEvent, type FlowState, type RecordedEvent } from "@autoflow/core";
import type { EventStore, Session, StorageError } from "@autoflow/storage";

export interface Snapshot {
  readonly session: Session;
  readonly events: readonly RecordedEvent[];
}

export type HubError = FlowError | StorageError;
export type HubResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: HubError };

/** What a subscriber is told. Only committed events travel; proposals will be a separate message type. */
export type HubMessage = { readonly type: "events"; readonly events: readonly RecordedEvent[] };

export type Subscriber = (message: HubMessage) => void;

export interface CreateInput {
  readonly title: string;
  readonly events: readonly FlowEvent[];
}

export interface SubmitInput {
  readonly sessionId: string;
  readonly events: readonly FlowEvent[];
  readonly actor: Actor;
}

export interface SessionHub {
  create(input: CreateInput): Promise<HubResult<Snapshot>>;
  list(): Promise<readonly Session[]>;
  snapshot(sessionId: string): Promise<HubResult<Snapshot>>;
  submit(input: SubmitInput): Promise<HubResult<readonly RecordedEvent[]>>;
  subscribe(sessionId: string, subscriber: Subscriber): () => void;
}

export interface HubDeps {
  readonly store: EventStore;
  readonly makeId: () => string;
}

/** Folds the candidates onto the state, so event two is judged against what event one produced. */
const validateAll = (state: FlowState, events: readonly FlowEvent[]): HubResult<FlowState> =>
  events.reduce<HubResult<FlowState>>((acc, event) => (acc.ok ? reduce(acc.value, event) : acc), { ok: true, value: state });

const project = (events: readonly RecordedEvent[]): HubResult<FlowState> => replay(events.map((e) => e.event));

/**
 * Owns the rule that the log only ever holds events that replay: every submission is validated
 * against the current projection before it is appended, and the append is pinned to the sequence
 * it was validated against so a concurrent write cannot slip underneath it.
 */
export const createSessionHub = ({ store, makeId }: HubDeps): SessionHub => {
  const subscribers = new Map<string, Set<Subscriber>>();

  const announce = (sessionId: string, message: HubMessage): void => {
    for (const subscriber of subscribers.get(sessionId) ?? []) {
      try {
        subscriber(message);
      } catch {
        // A dead socket must not stop the others from being told; the transport cleans it up.
      }
    }
  };

  return {
    create: async ({ title, events }) => {
      const validated = validateAll(emptyFlow(), events);
      if (!validated.ok) return validated;

      const created = await store.createSession({ id: makeId(), title });
      if (!created.ok) return created;

      const appended = await store.append({ sessionId: created.value.id, events, actor: "import", expectedSeq: 0 });
      if (!appended.ok) return appended;
      return { ok: true, value: { session: created.value, events: appended.value } };
    },

    list: () => store.listSessions(),

    snapshot: async (sessionId) => {
      const session = await store.getSession(sessionId);
      if (!session.ok) return session;
      const events = await store.readEvents(sessionId);
      if (!events.ok) return events;
      return { ok: true, value: { session: session.value, events: events.value } };
    },

    submit: async ({ sessionId, events, actor }) => {
      const existing = await store.readEvents(sessionId);
      if (!existing.ok) return existing;

      const state = project(existing.value);
      if (!state.ok) return state;

      const validated = validateAll(state.value, events);
      if (!validated.ok) return validated;

      const appended = await store.append({
        sessionId,
        events,
        actor,
        expectedSeq: existing.value.at(-1)?.seq ?? 0,
      });
      if (!appended.ok) return appended;

      announce(sessionId, { type: "events", events: appended.value });
      return appended;
    },

    subscribe: (sessionId, subscriber) => {
      const forSession = subscribers.get(sessionId) ?? new Set<Subscriber>();
      subscribers.set(sessionId, forSession);
      forSession.add(subscriber);

      return () => {
        forSession.delete(subscriber);
        if (forSession.size === 0) subscribers.delete(sessionId);
      };
    },
  };
};
