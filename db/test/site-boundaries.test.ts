import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { Issue } from "~/shared/workflow";
import { getWorkspace, advanceIssue } from "../repositories/issues";
import { convertGuest } from "../repositories/users";
import { getSite } from "../repositories/sites";
const state = vi.hoisted(() => ({
  issue: null as Issue | null,
  filter: undefined as SQL | undefined,
  writes: 0,
  values: {} as Record<string, unknown>,
}));
vi.mock("../repositories/sites", () => ({ getSite: vi.fn(), seedSite: vi.fn() }));
vi.mock("../db", () => {
  const tx = {
    execute: vi.fn(),
    select: (fields?: Record<string, unknown>) => ({
      from: () => ({
        where: (filter: SQL) => {
          state.filter = filter;
          if (fields && "value" in fields) return Promise.resolve([{ value: 1 }]);
          return { for: async () => (state.issue ? [state.issue] : []) };
        },
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        state.writes++;
        state.values = values;
        return {
          where: (filter: SQL) => {
            state.filter = filter;
            return { returning: async () => [{ id: 7, organizationId: 11, ...values }] };
          },
        };
      },
    }),
  };
  return { db: { ...tx, transaction: <T>(fn: (transaction: typeof tx) => Promise<T>) => fn(tx) } };
});
beforeEach(() => {
  vi.resetAllMocks();
  state.issue = null;
  state.writes = 0;
  state.filter = undefined;
});
describe("Site ownership and stale actions", () => {
  it("does not read domain records when the Site belongs to another organization", async () => {
    vi.mocked(getSite).mockResolvedValue(null);
    expect(await getWorkspace(11, 99)).toBeNull();
    await expect(advanceIssue(11, 99, 349, 0, "pass")).rejects.toThrow("Site not found");
    expect(state.filter).toBeUndefined();
  });
  it("scopes issue lookup by organization, Site, number, and active status", async () => {
    vi.mocked(getSite).mockResolvedValue({
      id: 99,
      organizationId: 11,
      name: "Demo",
      template: "blueprint",
      repositoryOwner: "example",
      repositoryName: "blueprint",
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });
    await expect(advanceIssue(11, 99, 349, 0, "pass")).rejects.toThrow("Issue not found");
    const query = new PgDialect().sqlToQuery(state.filter!);
    expect(query.params).toEqual([11, 99, 349]);
    expect(query.sql).toContain('"issues"."deleted_at" is null');
  });
  it("rejects repeated or stale versions before performing writes", async () => {
    vi.mocked(getSite).mockResolvedValue({
      id: 99,
      organizationId: 11,
      name: "Demo",
      template: "blueprint",
      repositoryOwner: "example",
      repositoryName: "blueprint",
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });
    state.issue = {
      id: 1,
      organizationId: 11,
      siteId: 99,
      number: 349,
      title: "Email",
      body: "",
      state: "open",
      stage: "prepare",
      step: "scope",
      risk: "high",
      productFacing: true,
      componentKey: "worker",
      traceKey: null,
      version: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    await expect(advanceIssue(11, 99, 349, 1, "pass")).rejects.toThrow("This issue changed");
    expect(state.writes).toBe(0);
  });
});
describe("guest conversion", () => {
  it("updates the same guest within its organization, preserving workspace ownership", async () => {
    const user = await convertGuest(7, 11, {
      email: "User@example.com",
      passwordHash: "hash",
      firstName: "Chris",
    });
    expect(user.id).toBe(7);
    expect(user.organizationId).toBe(11);
    expect(state.values).toEqual({
      email: "user@example.com",
      passwordHash: "hash",
      firstName: "Chris",
      isGuest: false,
      role: "user",
    });
    const query = new PgDialect().sqlToQuery(state.filter!);
    expect(query.params).toEqual([7, 11, true]);
    expect(query.sql).toContain('"users"."deleted_at" is null');
  });
});
