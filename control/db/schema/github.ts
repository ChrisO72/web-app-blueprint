import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { GitHubLabel, GitHubRaw, GitHubUser, RecordKind } from "~/integrations/github/records";

export type SyncCursor = { kind: RecordKind; path: string };
export const githubConnections = pgTable(
  "github_connections",
  {
    id: uuid().primaryKey().defaultRandom(),
    slot: integer().notNull().default(1).unique(),
    login: text().notNull(),
    repositoryId: bigint("repository_id", { mode: "number" }),
    owner: text(),
    name: text(),
    url: text(),
    encryptedToken: text("encrypted_token").notNull(),
    encryptedWebhookSecret: text("encrypted_webhook_secret"),
    webhookId: bigint("webhook_id", { mode: "number" }),
    webhookUrl: text("webhook_url"),
    status: text({
      enum: ["draft", "connecting", "syncing", "connected", "error", "disconnecting"],
    })
      .notNull()
      .default("draft"),
    syncId: uuid("sync_id"),
    syncCursor: jsonb("sync_cursor").$type<SyncCursor>(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastWebhookAt: timestamp("last_webhook_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  () => [check("github_single_connection", sql`slot = 1`)],
);

function sourceColumns() {
  return {
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => githubConnections.id, { onDelete: "cascade" }),
    githubId: bigint("github_id", { mode: "number" }).notNull(),
    url: text().notNull(),
    githubCreatedAt: timestamp("github_created_at", { withTimezone: true }).notNull(),
    githubUpdatedAt: timestamp("github_updated_at", { withTimezone: true }).notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
    unavailableAt: timestamp("unavailable_at", { withTimezone: true }),
    raw: jsonb().$type<GitHubRaw>().notNull(),
  };
}
function issueColumns() {
  return {
    number: integer().notNull(),
    title: text().notNull(),
    description: text(),
    state: text().notNull(),
    stateReason: text("state_reason"),
    labels: jsonb().$type<GitHubLabel[]>().notNull().default([]),
    author: jsonb().$type<GitHubUser | null>(),
    assignees: jsonb().$type<GitHubUser[]>().notNull().default([]),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  };
}
export const githubIssues = pgTable(
  "github_issues",
  { ...sourceColumns(), ...issueColumns() },
  (table) => [
    primaryKey({ columns: [table.connectionId, table.githubId] }),
    index("github_issues_updated_idx").on(table.connectionId, table.githubUpdatedAt),
  ],
);
export const githubPulls = pgTable(
  "github_pulls",
  {
    ...sourceColumns(),
    ...issueColumns(),
    draft: boolean().notNull().default(false),
    mergedAt: timestamp("merged_at", { withTimezone: true }),
    headBranch: text("head_branch").notNull(),
    baseBranch: text("base_branch").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.connectionId, table.githubId] }),
    index("github_pulls_updated_idx").on(table.connectionId, table.githubUpdatedAt),
  ],
);
export const githubRuns = pgTable(
  "github_runs",
  {
    ...sourceColumns(),
    runNumber: integer("run_number").notNull(),
    runAttempt: integer("run_attempt").notNull(),
    workflowId: bigint("workflow_id", { mode: "number" }).notNull(),
    workflow: text(),
    title: text().notNull(),
    status: text().notNull(),
    conclusion: text(),
    event: text().notNull(),
    branch: text(),
    commitSha: text("commit_sha").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.connectionId, table.githubId] }),
    index("github_runs_updated_idx").on(table.connectionId, table.githubUpdatedAt),
  ],
);

export type GitHubConnection = typeof githubConnections.$inferSelect;
