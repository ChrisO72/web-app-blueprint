import { bigint, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { runnerReadiness, taskFailureReasons, type CodexProgress } from "~/control/runner-protocol";
import { taskEfforts, taskModels, taskStatuses, taskTargetKinds } from "~/control/tasks";

export const controlTasks = pgTable(
  "control_tasks",
  {
    id: uuid().primaryKey(),
    organizationId: integer("organization_id").notNull(),
    createdByUserId: integer("created_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    status: text({ enum: taskStatuses }).notNull().default("created"),
    // These snapshots outlive the connection and its GitHub mirror.
    connectionId: uuid("connection_id").notNull(),
    repositoryId: bigint("repository_id", { mode: "number" }).notNull(),
    repositoryName: text("repository_name").notNull(),
    targetKind: text("target_kind", { enum: taskTargetKinds }).notNull(),
    targetId: bigint("target_id", { mode: "number" }).notNull(),
    targetNumber: integer("target_number").notNull(),
    targetTitle: text("target_title").notNull(),
    targetUrl: text("target_url").notNull(),
    skillPath: text("skill_path").notNull(),
    skillSha: text("skill_sha").notNull(),
    model: text({ enum: taskModels }),
    effort: text({ enum: taskEfforts }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    failure: text({ enum: taskFailureReasons }),
    leaseId: uuid("lease_id"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    codexProgress: jsonb("codex_progress").$type<CodexProgress>(),
  },
  (table) => [
    index("control_tasks_history_idx").on(table.organizationId, table.createdAt, table.id),
    index("control_tasks_queue_idx")
      .on(table.organizationId, table.repositoryId, table.createdAt, table.id)
      .where(sql`${table.status} = 'queued'`),
  ],
);

export type ControlTask = typeof controlTasks.$inferSelect;

export const controlRunners = pgTable("control_runners", {
  organizationId: integer("organization_id").primaryKey(),
  instanceId: uuid("instance_id").notNull(),
  readiness: text({ enum: runnerReadiness }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
});
