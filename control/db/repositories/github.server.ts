import { and, count, desc, eq, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { getDatabase } from "../db.server";
import {
  githubConnections,
  githubIssues,
  githubPulls,
  githubRuns,
  type GitHubConnection,
  type SyncCursor,
} from "../schema/github";
import {
  normalizeIssue,
  normalizePull,
  normalizeRun,
  type RecordKind,
} from "~/integrations/github/records";

export const connectionOperationTimeout = 120_000;

const publicColumns = {
  id: githubConnections.id,
  login: githubConnections.login,
  repositoryId: githubConnections.repositoryId,
  owner: githubConnections.owner,
  name: githubConnections.name,
  url: githubConnections.url,
  webhookId: githubConnections.webhookId,
  webhookUrl: githubConnections.webhookUrl,
  status: githubConnections.status,
  lastSyncedAt: githubConnections.lastSyncedAt,
  lastWebhookAt: githubConnections.lastWebhookAt,
  lastError: githubConnections.lastError,
};
export async function getConnection(): Promise<GitHubConnection | null> {
  const [connection] = await getDatabase().select().from(githubConnections).limit(1);
  return connection ?? null;
}
export async function getPublicConnection() {
  const [connection] = await getDatabase().select(publicColumns).from(githubConnections).limit(1);
  return connection ?? null;
}
export async function createDraft(login: string, encryptedToken: string) {
  const [connection] = await getDatabase()
    .insert(githubConnections)
    .values({ login, encryptedToken })
    .onConflictDoUpdate({
      target: githubConnections.slot,
      set: { login, encryptedToken, lastError: null },
      setWhere: isNull(githubConnections.repositoryId),
    })
    .returning();
  if (!connection) throw new Error("Disconnect the current repository before selecting another.");
  return connection;
}
export async function updateConnection(
  id: string,
  values: Partial<typeof githubConnections.$inferInsert>,
) {
  const [connection] = await getDatabase()
    .update(githubConnections)
    .set(values)
    .where(eq(githubConnections.id, id))
    .returning();
  return connection ?? null;
}
export async function beginConnecting(
  id: string,
  values: Pick<
    typeof githubConnections.$inferInsert,
    "repositoryId" | "owner" | "name" | "url" | "encryptedWebhookSecret" | "webhookUrl"
  >,
) {
  const [connection] = await getDatabase()
    .update(githubConnections)
    .set({ ...values, status: "connecting", lastError: null })
    .where(
      and(
        eq(githubConnections.id, id),
        isNull(githubConnections.webhookId),
        ne(githubConnections.status, "disconnecting"),
        or(
          ne(githubConnections.status, "connecting"),
          lt(githubConnections.updatedAt, new Date(Date.now() - connectionOperationTimeout)),
        ),
      ),
    )
    .returning();
  return connection ?? null;
}
export async function removeConnection(id: string) {
  await getDatabase().delete(githubConnections).where(eq(githubConnections.id, id));
}
export async function progressSync(
  id: string,
  syncId: string,
  cursor: SyncCursor | null,
  complete = false,
) {
  await getDatabase()
    .update(githubConnections)
    .set({
      syncCursor: cursor,
      ...(complete
        ? { status: "connected" as const, lastSyncedAt: new Date(), lastError: null, syncId: null }
        : {}),
    })
    .where(
      and(
        eq(githubConnections.id, id),
        eq(githubConnections.syncId, syncId),
        ne(githubConnections.status, "disconnecting"),
      ),
    );
}
export async function syncError(id: string, syncId: string | undefined, message: string) {
  await getDatabase()
    .update(githubConnections)
    .set({ status: "error", lastError: message })
    .where(
      and(
        eq(githubConnections.id, id),
        ne(githubConnections.status, "disconnecting"),
        ...(syncId ? [eq(githubConnections.syncId, syncId)] : []),
      ),
    );
}

export async function upsertRecord(connectionId: string, kind: RecordKind, value: unknown) {
  const db = getDatabase();
  // The connection lock prevents an in-flight sync from inserting after disconnect.
  return db.transaction(async (tx) => {
    const [active] = await tx
      .select({ id: githubConnections.id })
      .from(githubConnections)
      .where(
        and(eq(githubConnections.id, connectionId), ne(githubConnections.status, "disconnecting")),
      )
      .for("key share");
    if (!active) return;
    if (kind === "issue") {
      const data = { connectionId, ...normalizeIssue(value), syncedAt: new Date() };
      await tx
        .insert(githubIssues)
        .values(data)
        .onConflictDoUpdate({
          target: [githubIssues.connectionId, githubIssues.githubId],
          set: data,
          setWhere: and(
            isNull(githubIssues.unavailableAt),
            lte(githubIssues.githubUpdatedAt, data.githubUpdatedAt),
          ),
        });
    } else if (kind === "pull") {
      const data = { connectionId, ...normalizePull(value), syncedAt: new Date() };
      await tx
        .insert(githubPulls)
        .values(data)
        .onConflictDoUpdate({
          target: [githubPulls.connectionId, githubPulls.githubId],
          set: data,
          setWhere: and(
            isNull(githubPulls.unavailableAt),
            lte(githubPulls.githubUpdatedAt, data.githubUpdatedAt),
          ),
        });
    } else {
      const data = { connectionId, ...normalizeRun(value), syncedAt: new Date() };
      await tx
        .insert(githubRuns)
        .values(data)
        .onConflictDoUpdate({
          target: [githubRuns.connectionId, githubRuns.githubId],
          set: data,
          setWhere: and(
            isNull(githubRuns.unavailableAt),
            lte(githubRuns.githubUpdatedAt, data.githubUpdatedAt),
            lte(githubRuns.runAttempt, data.runAttempt),
          ),
        });
    }
  });
}
export async function markUnavailable(connectionId: string, kind: RecordKind, githubId: number) {
  const table = kind === "issue" ? githubIssues : kind === "pull" ? githubPulls : githubRuns;
  await getDatabase()
    .update(table)
    .set({ unavailableAt: new Date() })
    .where(and(eq(table.connectionId, connectionId), eq(table.githubId, githubId)));
}
export async function listRecords(kind: RecordKind, page: number, pageSize: number) {
  const db = getDatabase();
  const connection = await getPublicConnection();
  if (!connection?.repositoryId) {
    return { connection, records: [], page: 1, totalPages: 0, totalCount: 0, pageSize };
  }
  const table = kind === "issue" ? githubIssues : kind === "pull" ? githubPulls : githubRuns;
  const where = and(eq(table.connectionId, connection.id), isNull(table.unavailableAt));
  const [total] = await db.select({ count: count() }).from(table).where(where);
  const totalCount = total.count;
  const totalPages = Math.ceil(totalCount / pageSize);
  const current = Math.min(page, Math.max(1, totalPages));
  const columns = {
    githubId: table.githubId,
    title: table.title,
    url: table.url,
    updatedAt: table.githubUpdatedAt,
  };
  const records =
    kind === "run"
      ? await db
          .select({
            ...columns,
            number: githubRuns.runNumber,
            state: githubRuns.status,
            conclusion: githubRuns.conclusion,
            branch: githubRuns.branch,
            labels: sql<never[]>`'[]'::jsonb`,
            draft: sql<boolean>`false`,
            mergedAt: sql<null>`null`,
          })
          .from(githubRuns)
          .where(and(eq(githubRuns.connectionId, connection.id), isNull(githubRuns.unavailableAt)))
          .orderBy(desc(githubRuns.githubUpdatedAt), desc(githubRuns.githubId))
          .limit(pageSize)
          .offset((current - 1) * pageSize)
      : kind === "pull"
        ? await db
            .select({
              githubId: githubPulls.githubId,
              title: githubPulls.title,
              url: githubPulls.url,
              updatedAt: githubPulls.githubUpdatedAt,
              number: githubPulls.number,
              state: githubPulls.state,
              labels: githubPulls.labels,
              draft: githubPulls.draft,
              mergedAt: githubPulls.mergedAt,
              conclusion: sql<null>`null`,
              branch: githubPulls.headBranch,
            })
            .from(githubPulls)
            .where(
              and(eq(githubPulls.connectionId, connection.id), isNull(githubPulls.unavailableAt)),
            )
            .orderBy(desc(githubPulls.githubUpdatedAt), desc(githubPulls.githubId))
            .limit(pageSize)
            .offset((current - 1) * pageSize)
        : await db
            .select({
              ...columns,
              number: githubIssues.number,
              state: githubIssues.state,
              labels: githubIssues.labels,
              draft: sql<boolean>`false`,
              mergedAt: sql<null>`null`,
              conclusion: sql<null>`null`,
              branch: sql<null>`null`,
            })
            .from(githubIssues)
            .where(
              and(eq(githubIssues.connectionId, connection.id), isNull(githubIssues.unavailableAt)),
            )
            .orderBy(desc(githubIssues.githubUpdatedAt), desc(githubIssues.githubId))
            .limit(pageSize)
            .offset((current - 1) * pageSize);
  return { connection, records, page: current, totalPages, totalCount, pageSize };
}

export async function getRecordDetails(kind: RecordKind, githubId: number) {
  const connection = await getPublicConnection();
  if (!connection?.repositoryId) return null;
  const db = getDatabase();
  const table = kind === "issue" ? githubIssues : kind === "pull" ? githubPulls : githubRuns;
  const common = {
    githubId: table.githubId,
    createdAt: table.githubCreatedAt,
    updatedAt: table.githubUpdatedAt,
    syncedAt: table.syncedAt,
  };
  if (kind === "run") {
    const [record] = await db
      .select({
        ...common,
        workflow: githubRuns.workflow,
        event: githubRuns.event,
        branch: githubRuns.branch,
        commitSha: githubRuns.commitSha,
        runAttempt: githubRuns.runAttempt,
        startedAt: githubRuns.startedAt,
      })
      .from(githubRuns)
      .where(
        and(
          eq(githubRuns.connectionId, connection.id),
          eq(githubRuns.githubId, githubId),
          isNull(githubRuns.unavailableAt),
        ),
      )
      .limit(1);
    return record ? { ...record, kind: "run" as const } : null;
  }
  if (kind === "pull") {
    const [record] = await db
      .select({
        ...common,
        description: githubPulls.description,
        author: githubPulls.author,
        assignees: githubPulls.assignees,
        stateReason: githubPulls.stateReason,
        closedAt: githubPulls.closedAt,
        headBranch: githubPulls.headBranch,
        baseBranch: githubPulls.baseBranch,
        mergedAt: githubPulls.mergedAt,
      })
      .from(githubPulls)
      .where(
        and(
          eq(githubPulls.connectionId, connection.id),
          eq(githubPulls.githubId, githubId),
          isNull(githubPulls.unavailableAt),
        ),
      )
      .limit(1);
    return record ? { ...record, kind: "pull" as const } : null;
  }
  const [record] = await db
    .select({
      ...common,
      description: githubIssues.description,
      author: githubIssues.author,
      assignees: githubIssues.assignees,
      stateReason: githubIssues.stateReason,
      closedAt: githubIssues.closedAt,
    })
    .from(githubIssues)
    .where(
      and(
        eq(githubIssues.connectionId, connection.id),
        eq(githubIssues.githubId, githubId),
        isNull(githubIssues.unavailableAt),
      ),
    )
    .limit(1);
  return record ? { ...record, kind: "issue" as const } : null;
}
