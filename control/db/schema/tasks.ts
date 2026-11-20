import { bigint, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { taskTargetKinds } from "~/control/tasks";

export const controlTasks = pgTable(
  "control_tasks",
  {
    id: uuid().primaryKey(),
    organizationId: integer("organization_id").notNull(),
    createdByUserId: integer("created_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    status: text({ enum: ["created"] })
      .notNull()
      .default("created"),
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
  },
  (table) => [
    index("control_tasks_history_idx").on(table.organizationId, table.createdAt, table.id),
  ],
);

export type ControlTask = typeof controlTasks.$inferSelect;
