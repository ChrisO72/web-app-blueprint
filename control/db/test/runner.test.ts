import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RunnerJob, RunnerPoll } from "~/control/runner-protocol";
import { finishRunnerTask, pollRunner } from "../repositories/runner.server";

const state = vi.hoisted(() => ({
  responses: [] as unknown[][],
  filters: [] as SQL[],
  edits: [] as Record<string, unknown>[],
}));

vi.mock("../db.server", () => {
  function rows(condition: SQL) {
    state.filters.push(condition);
    const next = async () => {
      const result = state.responses.shift();
      if (!result) throw new Error("Unexpected query");
      return result;
    };
    const query = {
      limit: () => query,
      orderBy: () => query,
      for: next,
      returning: next,
      then: (resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) =>
        next().then(resolve, reject),
    };
    return query;
  }
  const tx = {
    insert: () => ({ values: () => ({ onConflictDoNothing: async () => undefined }) }),
    select: () => ({ from: () => ({ where: rows }) }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        state.edits.push(values);
        return { where: rows };
      },
    }),
  };
  return {
    getDatabase: () => ({
      transaction: async (run: (transaction: typeof tx) => unknown) => run(tx),
    }),
  };
});

const input: RunnerPoll = {
  action: "poll",
  instanceId: "d30f7f05-fee2-4d16-9c5e-1d8a29547aad",
  repositoryName: "owner/repo",
  readiness: "ready",
};
const job: RunnerJob = {
  id: "d5424b9e-de9d-4e62-8aed-2ef8e822a4a3",
  leaseId: "f56ca7cc-2606-4a1c-bcab-be411bb4f132",
  repositoryName: "owner/repo",
  targetKind: "issue",
  targetNumber: 1,
  targetUrl: "https://github.com/owner/repo/issues/1",
  skillPath: ".agents/skills/prepare/SKILL.md",
  skillSha: "a".repeat(40),
  model: "gpt-6.2-sol",
  effort: "medium",
};

beforeEach(() => {
  state.responses = [];
  state.filters = [];
  state.edits = [];
});

describe("Control runner leases", () => {
  it("claims once, then returns the same lease after a duplicate idle poll", async () => {
    const owner = { instanceId: input.instanceId };
    state.responses = [
      [owner],
      [],
      [],
      [{ repositoryId: 23, owner: "owner", name: "repo" }],
      [{ id: job.id }],
      [job],
      [owner],
      [],
      [{ id: job.id, leaseId: job.leaseId }],
      [job],
    ];
    expect(await pollRunner(7, input)).toEqual({ job });
    expect(await pollRunner(7, input)).toEqual({ job });
    expect(state.edits.filter(({ status }) => status === "running")).toHaveLength(1);
    const claim = new PgDialect().sqlToQuery(state.filters[4]);
    expect(claim.params).toEqual([7, 23, "queued"]);
    expect(state.responses).toHaveLength(0);
  });

  it("leaves the queue alone when a second instance cannot take ownership", async () => {
    state.responses = [[]];
    expect(await pollRunner(7, input)).toBeNull();
    expect(state.edits).toHaveLength(1);
    const guard = new PgDialect().sqlToQuery(state.filters[0]);
    expect(guard.sql).toContain('"last_seen_at" <=');
    expect(guard.params).toEqual([7, input.instanceId, 45000]);
  });

  it("marks expired work failed and rejects renewal of its lease", async () => {
    state.responses = [[{ instanceId: input.instanceId }], [], []];
    expect(await pollRunner(7, { ...input, leaseId: job.leaseId })).toBeNull();
    expect(state.edits[1]).toMatchObject({ status: "failed", failure: "expired", leaseId: null });
    const expiry = new PgDialect().sqlToQuery(state.filters[1]);
    expect(expiry.sql).toContain('"lease_expires_at" <= clock_timestamp()');
    expect(expiry.params).toEqual([7, "running"]);
  });

  it("conditions completion on organization, task, owner, and an unexpired lease", async () => {
    state.responses = [[{ instanceId: input.instanceId }], [], []];
    expect(
      await finishRunnerTask(7, {
        action: "finish",
        taskId: job.id,
        leaseId: job.leaseId,
        instanceId: input.instanceId,
        result: { status: "done" },
      }),
    ).toBe(false);
    const guard = new PgDialect().sqlToQuery(state.filters[1]);
    expect(guard.sql).toContain('"lease_expires_at" > clock_timestamp()');
    expect(guard.params).toEqual([7, job.id, job.leaseId, "running"]);
  });
});
