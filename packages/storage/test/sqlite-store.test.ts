import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createSqliteEventStore } from "../src/sqlite.ts";
import { describeEventStore } from "./contract.ts";

const dirs: string[] = [];
const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "autoflow-store-"));
  dirs.push(dir);
  return dir;
};

afterAll(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describeEventStore("sqlite store", () => createSqliteEventStore(":memory:"));

describe("sqlite store durability", () => {
  it("still has the log after the process that wrote it has gone", async () => {
    const path = join(await tempDir(), "flow.db");

    const first = createSqliteEventStore(path);
    await first.createSession({ id: "s1", title: "Larkspur" });
    await first.append({
      sessionId: "s1",
      events: [{ type: "ClaimAdded", claim: { id: "c1", text: "The market is large", order: 0, topic: "Market" } }],
      actor: "import",
    });
    first.close();

    const second = createSqliteEventStore(path);
    try {
      const read = await second.readEvents("s1");
      expect(read.ok && read.value).toHaveLength(1);
      expect(read.ok && read.value[0]?.event).toEqual({
        type: "ClaimAdded",
        claim: { id: "c1", text: "The market is large", order: 0, topic: "Market" },
      });
      expect((await second.getSession("s1")).ok).toBe(true);
    } finally {
      second.close();
    }
  });

  it("keeps assigning sequences where the previous process left off", async () => {
    const path = join(await tempDir(), "flow.db");

    const first = createSqliteEventStore(path);
    await first.createSession({ id: "s1", title: "Larkspur" });
    await first.append({ sessionId: "s1", events: [{ type: "ClaimRemoved", claimId: "c1" }], actor: "import" });
    first.close();

    const second = createSqliteEventStore(path);
    try {
      const appended = await second.append({ sessionId: "s1", events: [{ type: "ClaimRemoved", claimId: "c2" }], actor: "import", expectedSeq: 1 });
      expect(appended.ok && appended.value.map((e) => e.seq)).toEqual([2]);
    } finally {
      second.close();
    }
  });

  it("creates the database file on first use", async () => {
    const path = join(await tempDir(), "nested", "flow.db");
    const store = createSqliteEventStore(path);
    try {
      expect((await store.createSession({ id: "s1", title: "Larkspur" })).ok).toBe(true);
    } finally {
      store.close();
    }
  });
});
