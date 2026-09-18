import type { FlowEvent } from "@autoflow/core";
import { createMemoryEventStore } from "@autoflow/storage";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionHub, type SessionHub } from "../src/hub.ts";

const claim = (id: string, text: string, order: number): FlowEvent => ({ type: "ClaimAdded", claim: { id, text, order } });
const rename = (claimId: string, text: string): FlowEvent => ({ type: "ClaimRenamed", claimId, text });

let hub: SessionHub;

const openSession = async (events: readonly FlowEvent[] = [claim("c1", "The market is large", 0)]) => {
  const created = await hub.create({ title: "Larkspur", events });
  if (!created.ok) throw new Error(`Could not create session: ${created.error.message}`);
  return created.value;
};

beforeEach(() => {
  hub = createSessionHub({ store: createMemoryEventStore(), makeId: (() => {
    let n = 0;
    return () => `s${++n}`;
  })() });
});

describe("creating a session", () => {
  it("persists the seeded events and returns the log", async () => {
    const { session, events } = await openSession();
    expect(session).toMatchObject({ id: "s1", title: "Larkspur" });
    expect(events.map((e) => e.seq)).toEqual([1]);
    expect(events[0]).toMatchObject({ actor: "import" });
  });

  it("refuses a seed that will not replay, without leaving a session behind", async () => {
    const created = await hub.create({ title: "Broken", events: [rename("ghost", "x")] });
    expect(created).toMatchObject({ ok: false, error: { code: "CLAIM_NOT_FOUND" } });
    expect(await hub.list()).toEqual([]);
  });

  it("lists the sessions it has created", async () => {
    await openSession();
    await hub.create({ title: "Quill", events: [] });
    expect((await hub.list()).map((s) => s.title)).toEqual(["Quill", "Larkspur"]);
  });
});

describe("reading a session", () => {
  it("returns the session with its log", async () => {
    const { session } = await openSession();
    const read = await hub.snapshot(session.id);
    expect(read.ok && read.value.session.title).toBe("Larkspur");
    expect(read.ok && read.value.events.map((e) => e.seq)).toEqual([1]);
  });

  it("reports a session that is not there", async () => {
    expect(await hub.snapshot("ghost")).toMatchObject({ ok: false, error: { code: "SESSION_NOT_FOUND" } });
  });
});

describe("submitting events", () => {
  it("validates against the current flow before appending", async () => {
    const { session } = await openSession();
    const submitted = await hub.submit({ sessionId: session.id, events: [rename("c1", "The market is crowded")], actor: "participant" });

    expect(submitted.ok && submitted.value.map((e) => e.seq)).toEqual([2]);
    const read = await hub.snapshot(session.id);
    expect(read.ok && read.value.events).toHaveLength(2);
  });

  it("refuses an event the domain rejects, and appends nothing", async () => {
    const { session } = await openSession();
    const submitted = await hub.submit({ sessionId: session.id, events: [rename("ghost", "x")], actor: "participant" });

    expect(submitted).toMatchObject({ ok: false, error: { code: "CLAIM_NOT_FOUND" } });
    const read = await hub.snapshot(session.id);
    expect(read.ok && read.value.events).toHaveLength(1);
  });

  it("refuses a batch whose later event is invalid, so a partial batch never lands", async () => {
    const { session } = await openSession();
    const submitted = await hub.submit({
      sessionId: session.id,
      events: [claim("c2", "Valid", 1), rename("ghost", "x")],
      actor: "participant",
    });

    expect(submitted.ok).toBe(false);
    const read = await hub.snapshot(session.id);
    expect(read.ok && read.value.events).toHaveLength(1);
  });

  it("validates each event against the state the ones before it produced", async () => {
    const { session } = await openSession();
    const submitted = await hub.submit({
      sessionId: session.id,
      events: [claim("c2", "The team is strong", 1), rename("c2", "The team is unproven")],
      actor: "participant",
    });

    expect(submitted.ok).toBe(true);
    const read = await hub.snapshot(session.id);
    expect(read.ok && read.value.events.map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it("reports a submission to a session that is not there", async () => {
    expect(await hub.submit({ sessionId: "ghost", events: [], actor: "participant" })).toMatchObject({
      ok: false,
      error: { code: "SESSION_NOT_FOUND" },
    });
  });
});

describe("fan-out", () => {
  it("tells every subscriber on the session about newly appended events", async () => {
    const { session } = await openSession();
    const first = vi.fn();
    const second = vi.fn();
    hub.subscribe(session.id, first);
    hub.subscribe(session.id, second);

    const submitted = await hub.submit({ sessionId: session.id, events: [rename("c1", "Renamed")], actor: "participant" });

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    expect(first).toHaveBeenCalledWith({ type: "events", events: submitted.value });
    expect(second).toHaveBeenCalledWith({ type: "events", events: submitted.value });
  });

  it("keeps sessions apart, so one room never sees another's events", async () => {
    const a = await openSession();
    const b = await hub.create({ title: "Quill", events: [claim("q1", "Renters build credit", 0)] });
    expect(b.ok).toBe(true);
    if (!b.ok) return;

    const listener = vi.fn();
    hub.subscribe(b.value.session.id, listener);
    await hub.submit({ sessionId: a.session.id, events: [rename("c1", "Renamed")], actor: "participant" });

    expect(listener).not.toHaveBeenCalled();
  });

  it("says nothing to a subscriber that has unsubscribed", async () => {
    const { session } = await openSession();
    const listener = vi.fn();
    const unsubscribe = hub.subscribe(session.id, listener);

    unsubscribe();
    await hub.submit({ sessionId: session.id, events: [rename("c1", "Renamed")], actor: "participant" });

    expect(listener).not.toHaveBeenCalled();
  });

  it("does not announce a submission the domain rejected", async () => {
    const { session } = await openSession();
    const listener = vi.fn();
    hub.subscribe(session.id, listener);

    await hub.submit({ sessionId: session.id, events: [rename("ghost", "x")], actor: "participant" });

    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps serving the other subscribers when one of them throws", async () => {
    const { session } = await openSession();
    const throwing = vi.fn().mockImplementation(() => {
      throw new Error("socket already closed");
    });
    const healthy = vi.fn();
    hub.subscribe(session.id, throwing);
    hub.subscribe(session.id, healthy);

    const submitted = await hub.submit({ sessionId: session.id, events: [rename("c1", "Renamed")], actor: "participant" });

    expect(submitted.ok).toBe(true);
    expect(healthy).toHaveBeenCalled();
  });
});
