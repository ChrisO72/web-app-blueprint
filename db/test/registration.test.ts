import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { convertGuest, createGuest, registerUser } from "../repositories/users";
import { seedSite } from "../repositories/sites";

const state = vi.hoisted(() => ({
  users: [] as Record<string, unknown>[],
  events: [] as string[],
  countFilters: [] as SQL[],
  locks: [] as SQL[],
}));

vi.mock("../repositories/sites", () => ({ seedSite: vi.fn() }));
vi.mock("../db", () => {
  const tx = {
    execute: async (query: SQL) => {
      state.events.push("lock");
      state.locks.push(query);
    },
    select: () => ({
      from: () => ({
        where: async (filter: SQL) => {
          state.events.push("count");
          state.countFilters.push(filter);
          return [{ value: state.users.filter((user) => !user.isGuest).length }];
        },
      }),
    }),
    insert: (table: Table) => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          if (getTableName(table) === "organizations") return [{ id: 11 }];
          state.events.push("register");
          const row = { id: state.users.length + 1, isGuest: false, ...values };
          state.users.push(row);
          return [row];
        },
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: (filter: SQL) => ({
          returning: async () => {
            state.events.push("convert");
            const { params } = new PgDialect().sqlToQuery(filter);
            const row = state.users.find(
              (user) =>
                user.id === params[0] &&
                user.organizationId === params[1] &&
                user.isGuest &&
                !user.deletedAt,
            );
            if (!row) return [];
            Object.assign(row, values);
            return [row];
          },
        }),
      }),
    }),
  };
  return { db: { transaction: <T>(run: (transaction: typeof tx) => Promise<T>) => run(tx) } };
});

const account = { email: "Chris@example.com", passwordHash: "hash", firstName: "Chris" };

beforeEach(() => {
  vi.clearAllMocks();
  state.users = [];
  state.events = [];
  state.countFilters = [];
  state.locks = [];
});

describe("initial administrator registration", () => {
  it("ignores guest visits when granting admin to the first direct registration", async () => {
    await createGuest();
    expect(state.users[0]).toMatchObject({ isGuest: true, role: "user" });
    expect(state.locks).toHaveLength(0);
    const first = await registerUser(account);
    expect(first).toMatchObject({ email: "chris@example.com", role: "admin", organizationId: 11 });
    expect(seedSite).toHaveBeenCalledTimes(2);
    expect(state.events.slice(-3)).toEqual(["lock", "count", "register"]);
    const query = new PgDialect().sqlToQuery(state.countFilters[0]);
    expect(query.sql).toContain('"users"."is_guest" =');
    expect(query.params).toEqual([false]);
    expect(query.sql).not.toContain("deleted_at");
  });

  it("makes the first guest conversion admin while preserving its workspace", async () => {
    state.users = [{ id: 7, organizationId: 11, isGuest: true, role: "user" }];
    expect(await convertGuest(7, 11, account)).toMatchObject({
      id: 7,
      organizationId: 11,
      isGuest: false,
      role: "admin",
    });
    expect(seedSite).not.toHaveBeenCalled();
    expect(state.events).toEqual(["lock", "count", "convert"]);
    expect((await registerUser({ ...account, email: "later@example.com" })).role).toBe("user");
    const lockQueries = state.locks.map((lock) => new PgDialect().sqlToQuery(lock));
    expect(lockQueries[0]).toEqual(lockQueries[1]);
    expect(lockQueries[0].sql).toContain("pg_advisory_xact_lock");
  });

  it("does not grant admin to a guest conversion after a registered account exists", async () => {
    await registerUser(account);
    state.users.push({ id: 7, organizationId: 11, isGuest: true, role: "user" });
    expect((await convertGuest(7, 11, { ...account, email: "later@example.com" })).role).toBe(
      "user",
    );
  });

  it("does not reopen admin signup after a registered account is deleted", async () => {
    state.users = [{ id: 1, isGuest: false, role: "admin", deletedAt: new Date() }];
    expect((await registerUser(account)).role).toBe("user");
  });

  it("rejects conversion outside the guest's organization", async () => {
    state.users = [{ id: 7, organizationId: 11, isGuest: true, role: "user" }];
    await expect(convertGuest(7, 99, account)).rejects.toThrow(
      "Guest account is no longer available",
    );
    expect(state.users[0]).toMatchObject({ isGuest: true, role: "user" });
  });
});
