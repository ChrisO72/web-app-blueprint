import { describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import type { Table } from "drizzle-orm";
import { seedSite } from "../repositories/sites";
import { db } from "../db";
const records = vi.hoisted(() => new Map<string, Record<string, unknown>[]>());
vi.mock("../db", () => {
  let id = 0;
  const tx = {
    insert: (table: Table) => ({
      values: (values: Record<string, unknown>) => {
        const row = { id: ++id, ...values };
        const name = getTableName(table);
        records.set(name, [...(records.get(name) ?? []), row]);
        return { returning: async () => [row] };
      },
    }),
  };
  return { db: { transaction: <T>(fn: (transaction: typeof tx) => Promise<T>) => fn(tx) } };
});
describe("seeded delivery relationships", () => {
  it("creates one isolated Site with connected issues, PRs, tasks, and comments", async () => {
    const site = await db.transaction((tx) => seedSite(tx, 11));
    expect(records.get("sites")).toHaveLength(1);
    const issues = records.get("issues")!;
    const prs = records.get("pull_requests")!;
    const issueIds = new Set(issues.map((i) => i.id));
    for (const [table, rows] of records)
      for (const row of rows) {
        expect(row.organizationId).toBe(11);
        if (table !== "sites") expect(row.siteId).toBe(site.id);
        if (row.issueId) expect(issueIds.has(row.issueId)).toBe(true);
        if (row.pullRequestId)
          expect(prs.find((p) => p.id === row.pullRequestId)?.issueId).toBe(row.issueId);
      }
    expect(new Set(issues.map((i) => i.number)).size).toBe(issues.length);
    expect(new Set(prs.map((p) => p.number)).size).toBe(prs.length);
    expect(new Set(records.get("tasks")!.map((t) => t.status))).toEqual(
      new Set(["queued", "completed", "failed"]),
    );
    expect(issues.find((i) => i.number === 349)).toMatchObject({
      componentKey: "worker",
      traceKey: "trace-confirmation-349",
    });
  });
});
