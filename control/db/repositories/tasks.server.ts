import { and, count, desc, eq, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { taskTargetKinds, type TaskTarget } from "~/control/tasks";
import { getDatabase } from "../db.server";
import { githubConnections, githubIssues, githubPulls } from "../schema/github";
import { controlTasks, type ControlTask } from "../schema/tasks";
import { getPublicConnection } from "./github.server";

type TaskOwner = Pick<ControlTask, "organizationId" | "createdByUserId">;
type TaskSelection = Pick<ControlTask, "connectionId" | "targetKind" | "targetId" | "skillPath">;
type NewTask = TaskOwner & TaskSelection & Pick<ControlTask, "id" | "repositoryId" | "skillSha">;

const readyConnection = and(
  isNotNull(githubConnections.webhookId),
  ne(githubConnections.status, "disconnecting"),
);

function ownedSubmission(owner: TaskOwner, id: string) {
  return and(
    eq(controlTasks.id, id),
    eq(controlTasks.organizationId, owner.organizationId),
    eq(controlTasks.createdByUserId, owner.createdByUserId),
  );
}

export function matchesTaskSelection(task: ControlTask, selection: TaskSelection) {
  return (
    task.connectionId === selection.connectionId &&
    task.targetKind === selection.targetKind &&
    task.targetId === selection.targetId &&
    task.skillPath === selection.skillPath
  );
}

export async function listTasks(organizationId: number, page: number, pageSize: number) {
  const db = getDatabase();
  const scope = eq(controlTasks.organizationId, organizationId);
  const [total] = await db.select({ count: count() }).from(controlTasks).where(scope);
  const totalCount = total.count;
  const totalPages = Math.ceil(totalCount / pageSize);
  const currentPage = Math.min(page, Math.max(1, totalPages));
  const tasks = await db
    .select({
      id: controlTasks.id,
      createdAt: controlTasks.createdAt,
      status: controlTasks.status,
      repositoryName: controlTasks.repositoryName,
      targetKind: controlTasks.targetKind,
      targetNumber: controlTasks.targetNumber,
      targetTitle: controlTasks.targetTitle,
      targetUrl: controlTasks.targetUrl,
      skillPath: controlTasks.skillPath,
    })
    .from(controlTasks)
    .where(scope)
    .orderBy(desc(controlTasks.createdAt), desc(controlTasks.id))
    .limit(pageSize)
    .offset((currentPage - 1) * pageSize);

  return { tasks, page: currentPage, pageSize, totalCount, totalPages };
}

export async function listTaskTargets(query: string) {
  const connection = await getPublicConnection();
  if (!connection?.repositoryId || !connection.webhookId || connection.status === "disconnecting")
    return null;

  const db = getDatabase();
  const limit = 30;
  const number = /^#?\d+$/.test(query) ? query.replace(/^#/, "") : null;
  const matches = await Promise.all(
    taskTargetKinds.map(async (kind) => {
      const table = kind === "issue" ? githubIssues : githubPulls;
      const rows = await db
        .select({
          githubId: table.githubId,
          number: table.number,
          title: table.title,
          updatedAt: table.githubUpdatedAt,
        })
        .from(table)
        .where(
          and(
            eq(table.connectionId, connection.id),
            isNull(table.unavailableAt),
            query
              ? or(
                  sql`strpos(lower(${table.title}), lower(${query})) > 0`,
                  number ? sql`${table.number}::text = ${number}` : undefined,
                )
              : undefined,
          ),
        )
        .orderBy(desc(table.githubUpdatedAt), desc(table.githubId))
        .limit(limit);
      return rows.map((row) => ({ ...row, kind }));
    }),
  );
  const targets: TaskTarget[] = matches
    .flat()
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || b.githubId - a.githubId)
    .slice(0, limit)
    .map(({ kind, githubId, title, number }) => ({ kind, githubId, title, number }));
  return { connectionId: connection.id, targets };
}

export async function findTaskSubmission(owner: TaskOwner, id: string) {
  const [task] = await getDatabase().select().from(controlTasks).where(ownedSubmission(owner, id));
  return task ?? null;
}

export async function createTask(input: NewTask) {
  const table = input.targetKind === "issue" ? githubIssues : githubPulls;
  return getDatabase().transaction(async (tx) => {
    const [connection] = await tx
      .select({ owner: githubConnections.owner, name: githubConnections.name })
      .from(githubConnections)
      .where(
        and(
          eq(githubConnections.id, input.connectionId),
          eq(githubConnections.repositoryId, input.repositoryId),
          readyConnection,
        ),
      )
      .for("share");
    if (!connection?.name || !connection.owner) return { outcome: "connection" } as const;

    const [target] = await tx
      .select({ title: table.title, url: table.url, number: table.number })
      .from(table)
      .where(
        and(
          eq(table.connectionId, input.connectionId),
          eq(table.githubId, input.targetId),
          isNull(table.unavailableAt),
        ),
      )
      .for("share");
    if (!target) return { outcome: "target" } as const;

    const [inserted] = await tx
      .insert(controlTasks)
      .values({
        ...input,
        repositoryName: connection.owner + "/" + connection.name,
        targetTitle: target.title,
        targetUrl: target.url,
        targetNumber: target.number,
      })
      .onConflictDoNothing({ target: controlTasks.id })
      .returning({ id: controlTasks.id });
    if (inserted) return { outcome: "created" } as const;

    const [existing] = await tx.select().from(controlTasks).where(ownedSubmission(input, input.id));
    return {
      outcome: existing && matchesTaskSelection(existing, input) ? "created" : "conflict",
    } as const;
  });
}
