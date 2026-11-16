import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, uniqueIndex, varchar, boolean } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { timestamps } from "./shared";

export const stages = ["prepare", "build", "review", "deploy", "done"] as const;
export const steps = [
  "scope",
  "plan",
  "risk",
  "plan-review",
  "build",
  "checks",
  "code-review",
  "functional-review",
  "developer-approval",
  "product-approval",
  "update-main",
  "testing",
  "production",
  "done",
] as const;
const ownership = () => ({
  ...timestamps,
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
});
export const sites = pgTable(
  "sites",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    ...ownership(),
    name: varchar({ length: 100 }).notNull(),
    template: text().notNull().default("blueprint"),
    repositoryOwner: text("repository_owner").notNull().default("example"),
    repositoryName: text("repository_name").notNull().default("fullstack-blueprint"),
  },
  (t) => [
    index("sites_org_active_idx")
      .on(t.organizationId)
      .where(sql`deleted_at IS NULL`),
  ],
);
const siteOwnership = () => ({
  ...ownership(),
  siteId: integer("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
});
export const issues = pgTable(
  "issues",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    ...siteOwnership(),
    number: integer().notNull(),
    title: text().notNull(),
    body: text().notNull(),
    state: varchar({ enum: ["open", "closed"] })
      .notNull()
      .default("open"),
    stage: varchar({ enum: stages }).notNull().default("prepare"),
    step: varchar({ enum: steps }).notNull().default("scope"),
    risk: varchar({ enum: ["low", "high"] })
      .notNull()
      .default("low"),
    productFacing: boolean("product_facing").notNull().default(false),
    componentKey: text("component_key"),
    traceKey: text("trace_key"),
    version: integer().notNull().default(0),
  },
  (t) => [
    uniqueIndex("issues_site_number_idx").on(t.siteId, t.number),
    index("issues_org_site_idx").on(t.organizationId, t.siteId),
  ],
);
export const pullRequests = pgTable(
  "pull_requests",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    ...siteOwnership(),
    issueId: integer("issue_id")
      .notNull()
      .references(() => issues.id),
    number: integer().notNull(),
    title: text().notNull(),
    body: text().notNull(),
    branch: text().notNull(),
    revision: integer().notNull().default(1),
    state: varchar({ enum: ["draft", "open", "merged"] })
      .notNull()
      .default("open"),
    preview: text().notNull(),
  },
  (t) => [
    uniqueIndex("pull_requests_site_number_idx").on(t.siteId, t.number),
    index("prs_org_issue_idx").on(t.organizationId, t.issueId),
  ],
);
export const tasks = pgTable(
  "tasks",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    ...siteOwnership(),
    issueId: integer("issue_id")
      .notNull()
      .references(() => issues.id),
    pullRequestId: integer("pull_request_id").references(() => pullRequests.id),
    revision: integer(),
    title: text().notNull(),
    stage: varchar({ enum: stages }).notNull(),
    actor: varchar({ enum: ["agent", "human", "system"] })
      .notNull()
      .default("agent"),
    status: varchar({ enum: ["queued", "completed", "failed"] })
      .notNull()
      .default("queued"),
    result: text().notNull().default(""),
    evidence: text().notNull().default(""),
  },
  (t) => [index("tasks_org_site_status_idx").on(t.organizationId, t.siteId, t.status)],
);
export const comments = pgTable(
  "comments",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    ...siteOwnership(),
    issueId: integer("issue_id")
      .notNull()
      .references(() => issues.id),
    pullRequestId: integer("pull_request_id").references(() => pullRequests.id),
    taskId: integer("task_id").references(() => tasks.id),
    revision: integer(),
    author: text().notNull(),
    body: text().notNull(),
  },
  (t) => [index("comments_org_issue_idx").on(t.organizationId, t.issueId)],
);
