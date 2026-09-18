import type { Argument, Claim, FlowEvent } from "@autoflow/core";
import { describe, expect, it } from "vitest";
import type { EventStore } from "../src/types.ts";

const claim = (id: string, text: string, order: number): FlowEvent => ({ type: "ClaimAdded", claim: { id, text, order } satisfies Claim });

const argument = (id: string, claimId: string): FlowEvent => ({
  type: "ArgumentAdded",
  argument: { id, claimId, text: "No prior exits", stance: "attack", respondsTo: null, source: "live", sourceRefs: ["seg-1"] } satisfies Argument,
});

/**
 * One suite, run against every adapter. An adapter that passes this is interchangeable with the
 * others as far as the rest of the system is concerned; that is the whole point of the port.
 */
export const describeEventStore = (name: string, makeStore: () => Promise<EventStore> | EventStore): void => {
  const withStore = async (fn: (store: EventStore) => Promise<void>): Promise<void> => {
    const store = await makeStore();
    try {
      await fn(store);
    } finally {
      store.close();
    }
  };

  const seeded = async (store: EventStore, id = "s1") => {
    const created = await store.createSession({ id, title: "Larkspur" });
    if (!created.ok) throw new Error(`Could not seed session: ${created.error.message}`);
    return created.value;
  };

  describe(`${name} sessions`, () => {
    it("creates a session and reads it back with a timestamp", async () => {
      await withStore(async (store) => {
        const created = await seeded(store);
        expect(created).toMatchObject({ id: "s1", title: "Larkspur" });
        expect(Date.parse(created.createdAt)).not.toBeNaN();

        const found = await store.getSession("s1");
        expect(found).toEqual({ ok: true, value: created });
      });
    });

    it("refuses to create the same session twice", async () => {
      await withStore(async (store) => {
        await seeded(store);
        const again = await store.createSession({ id: "s1", title: "Different title" });
        expect(again).toMatchObject({ ok: false, error: { code: "SESSION_EXISTS" } });

        const found = await store.getSession("s1");
        expect(found.ok && found.value.title).toBe("Larkspur");
      });
    });

    it("reports a session that is not there", async () => {
      await withStore(async (store) => {
        expect(await store.getSession("ghost")).toMatchObject({ ok: false, error: { code: "SESSION_NOT_FOUND" } });
      });
    });

    it("lists sessions newest first", async () => {
      await withStore(async (store) => {
        await seeded(store, "older");
        await seeded(store, "newer");
        expect((await store.listSessions()).map((s) => s.id)).toEqual(["newer", "older"]);
      });
    });

    it("lists nothing when there are no sessions", async () => {
      await withStore(async (store) => expect(await store.listSessions()).toEqual([]));
    });
  });

  describe(`${name} appending`, () => {
    it("assigns sequences from 1 upward, in order, across separate appends", async () => {
      await withStore(async (store) => {
        await seeded(store);
        const first = await store.append({ sessionId: "s1", events: [claim("c1", "The market is large", 0)], actor: "import" });
        const second = await store.append({
          sessionId: "s1",
          events: [claim("c2", "The team is strong", 1), argument("a1", "c2")],
          actor: "participant",
        });

        expect(first.ok && first.value.map((e) => e.seq)).toEqual([1]);
        expect(second.ok && second.value.map((e) => e.seq)).toEqual([2, 3]);
      });
    });

    it("records the actor and a timestamp on every event", async () => {
      await withStore(async (store) => {
        await seeded(store);
        const appended = await store.append({ sessionId: "s1", events: [claim("c1", "A claim", 0)], actor: "classifier" });
        expect(appended.ok).toBe(true);
        if (!appended.ok) return;
        expect(appended.value[0]).toMatchObject({ seq: 1, actor: "classifier" });
        expect(Date.parse(appended.value[0]!.at)).not.toBeNaN();
      });
    });

    it("round-trips the event payload unchanged, including nested arrays", async () => {
      await withStore(async (store) => {
        await seeded(store);
        const event = argument("a1", "c1");
        await store.append({ sessionId: "s1", events: [event], actor: "classifier" });

        const read = await store.readEvents("s1");
        expect(read.ok && read.value[0]?.event).toEqual(event);
      });
    });

    it("accepts an empty append without moving the log", async () => {
      await withStore(async (store) => {
        await seeded(store);
        await store.append({ sessionId: "s1", events: [claim("c1", "A claim", 0)], actor: "import" });
        const none = await store.append({ sessionId: "s1", events: [], actor: "import" });

        expect(none).toEqual({ ok: true, value: [] });
        const read = await store.readEvents("s1");
        expect(read.ok && read.value).toHaveLength(1);
      });
    });

    it("will not append to a session that does not exist", async () => {
      await withStore(async (store) => {
        const appended = await store.append({ sessionId: "ghost", events: [claim("c1", "A claim", 0)], actor: "import" });
        expect(appended).toMatchObject({ ok: false, error: { code: "SESSION_NOT_FOUND" } });
      });
    });

    it("keeps each session's log separate", async () => {
      await withStore(async (store) => {
        await seeded(store, "s1");
        await seeded(store, "s2");
        await store.append({ sessionId: "s1", events: [claim("c1", "Only in s1", 0)], actor: "import" });

        const other = await store.readEvents("s2");
        expect(other).toEqual({ ok: true, value: [] });
        expect((await store.readEvents("s1")).ok).toBe(true);
      });
    });
  });

  describe(`${name} optimistic concurrency`, () => {
    it("appends when the caller validated against the current sequence", async () => {
      await withStore(async (store) => {
        await seeded(store);
        await store.append({ sessionId: "s1", events: [claim("c1", "The market is large", 0)], actor: "import" });

        const appended = await store.append({ sessionId: "s1", events: [claim("c2", "Second", 1)], actor: "participant", expectedSeq: 1 });
        expect(appended.ok && appended.value.map((e) => e.seq)).toEqual([2]);
      });
    });

    it("refuses a write validated against a stale sequence, and says where the log is", async () => {
      await withStore(async (store) => {
        await seeded(store);
        await store.append({ sessionId: "s1", events: [claim("c1", "First", 0)], actor: "import" });
        await store.append({ sessionId: "s1", events: [claim("c2", "Second", 1)], actor: "import" });

        const stale = await store.append({ sessionId: "s1", events: [claim("c3", "Third", 2)], actor: "participant", expectedSeq: 1 });
        expect(stale).toMatchObject({ ok: false, error: { code: "STALE_WRITE", currentSeq: 2 } });
      });
    });

    it("writes nothing at all when it refuses a stale append", async () => {
      await withStore(async (store) => {
        await seeded(store);
        await store.append({ sessionId: "s1", events: [claim("c1", "First", 0)], actor: "import" });

        await store.append({
          sessionId: "s1",
          events: [claim("c2", "Second", 1), claim("c3", "Third", 2)],
          actor: "participant",
          expectedSeq: 0,
        });

        const read = await store.readEvents("s1");
        expect(read.ok && read.value.map((e) => e.seq)).toEqual([1]);
      });
    });

    it("lets the first of two writers racing from the same sequence win", async () => {
      await withStore(async (store) => {
        await seeded(store);
        await store.append({ sessionId: "s1", events: [claim("c1", "First", 0)], actor: "import" });

        const winner = await store.append({ sessionId: "s1", events: [claim("c2", "Mine", 1)], actor: "participant", expectedSeq: 1 });
        const loser = await store.append({ sessionId: "s1", events: [claim("c3", "Also mine", 1)], actor: "participant", expectedSeq: 1 });

        expect(winner.ok).toBe(true);
        expect(loser).toMatchObject({ ok: false, error: { code: "STALE_WRITE", currentSeq: 2 } });
      });
    });

    it("treats expectedSeq 0 as 'the log is empty'", async () => {
      await withStore(async (store) => {
        await seeded(store);
        const appended = await store.append({ sessionId: "s1", events: [claim("c1", "First", 0)], actor: "import", expectedSeq: 0 });
        expect(appended.ok && appended.value.map((e) => e.seq)).toEqual([1]);
      });
    });
  });

  describe(`${name} reading`, () => {
    it("returns the log in sequence order", async () => {
      await withStore(async (store) => {
        await seeded(store);
        await store.append({ sessionId: "s1", events: [claim("c1", "First", 0)], actor: "import" });
        await store.append({ sessionId: "s1", events: [claim("c2", "Second", 1)], actor: "participant" });

        const read = await store.readEvents("s1");
        expect(read.ok && read.value.map((e) => e.seq)).toEqual([1, 2]);
      });
    });

    it("returns only what came after a sequence, for catching a client up", async () => {
      await withStore(async (store) => {
        await seeded(store);
        await store.append({
          sessionId: "s1",
          events: [claim("c1", "First", 0), claim("c2", "Second", 1), claim("c3", "Third", 2)],
          actor: "import",
        });

        const read = await store.readEvents("s1", 1);
        expect(read.ok && read.value.map((e) => e.seq)).toEqual([2, 3]);
        const past = await store.readEvents("s1", 3);
        expect(past).toEqual({ ok: true, value: [] });
      });
    });

    it("reports reading a session that is not there", async () => {
      await withStore(async (store) => {
        expect(await store.readEvents("ghost")).toMatchObject({ ok: false, error: { code: "SESSION_NOT_FOUND" } });
      });
    });

    it("returns an empty log for a session nothing has been appended to", async () => {
      await withStore(async (store) => {
        await seeded(store);
        expect(await store.readEvents("s1")).toEqual({ ok: true, value: [] });
      });
    });
  });
};
