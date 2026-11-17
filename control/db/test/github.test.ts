import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { getPublicConnection, upsertRecord } from "../repositories/github.server";
import { issue, run, CONNECTION_ID } from "~/integrations/github/test/fixtures";

const state = vi.hoisted(() => ({
  operations: [] as { data: Record<string, unknown>; guard?: SQL }[],
  active: true,
}));
vi.mock("../db.server", () => {
  const tx = {
    select: (columns?: Record<string, unknown>) => ({
      from: () => ({
        where: () => ({ for: async () => (state.active ? [{ id: "connection" }] : []) }),
        limit: async () => [
          Object.fromEntries(
            Object.keys(columns ?? {}).map((key) => [key, key === "id" ? "connection" : null]),
          ),
        ],
      }),
    }),
    insert: () => ({
      values: (data: Record<string, unknown>) => ({
        onConflictDoUpdate: async (config: { setWhere?: SQL }) => {
          state.operations.push({ data, guard: config.setWhere });
        },
      }),
    }),
  };
  return {
    getDatabase: () => ({
      ...tx,
      transaction: <T>(callback: (transaction: typeof tx) => Promise<T>) => callback(tx),
    }),
  };
});
beforeEach(() => {
  state.operations = [];
  state.active = true;
});
describe("GitHub repository boundaries", () => {
  it("never selects encrypted credentials for the public connection view", async () => {
    const result = await getPublicConnection();
    expect(result).not.toHaveProperty("encryptedToken");
    expect(result).not.toHaveProperty("encryptedWebhookSecret");
    expect(result).not.toHaveProperty("syncCursor");
  });
  it("uses stable scoped IDs and an atomic freshness guard for stale or duplicate issues", async () => {
    await upsertRecord(CONNECTION_ID, "issue", issue());
    const operation = state.operations[0];
    expect(operation.data).toMatchObject({
      connectionId: CONNECTION_ID,
      githubId: 10,
      description: "Description",
    });
    if (!operation.guard) throw new Error("Missing upsert guard");
    const query = new PgDialect().sqlToQuery(operation.guard);
    expect(query.sql).toContain('"unavailable_at" is null');
    expect(query.sql).toContain('"github_updated_at" <=');
    expect(query.params).toContain("2026-01-02T10:00:00.000Z");
  });
  it("also prevents older workflow attempts from replacing reruns", async () => {
    await upsertRecord(CONNECTION_ID, "run", run({ run_attempt: 2 }));
    const operation = state.operations[0];
    if (!operation.guard) throw new Error("Missing run upsert guard");
    const query = new PgDialect().sqlToQuery(operation.guard);
    expect(query.sql).toContain('"run_attempt" <=');
    expect(query.params).toContain(2);
  });
  it("does not insert records once a connection is disconnected", async () => {
    state.active = false;
    await upsertRecord(CONNECTION_ID, "issue", issue());
    expect(state.operations).toEqual([]);
  });
});
