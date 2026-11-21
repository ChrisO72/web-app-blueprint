import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, isNotNull, lte, ne, or, sql } from "drizzle-orm";
import {
  runnerJobSchema,
  runnerLeaseMs,
  type CodexProgress,
  type RunnerFinish,
  type RunnerPoll,
} from "~/control/runner-protocol";
import { getDatabase } from "../db.server";
import { githubConnections } from "../schema/github";
import { controlRunners, controlTasks } from "../schema/tasks";

const now = sql`clock_timestamp()`;
const leaseDuration = sql`${runnerLeaseMs} * interval '1 millisecond'`;
const cutoff = sql`${now} - ${leaseDuration}`;
const nextExpiry = sql`${now} + ${leaseDuration}`;
const jobColumns = {
  id: controlTasks.id,
  leaseId: controlTasks.leaseId,
  repositoryName: controlTasks.repositoryName,
  targetKind: controlTasks.targetKind,
  targetNumber: controlTasks.targetNumber,
  targetUrl: controlTasks.targetUrl,
  skillPath: controlTasks.skillPath,
  skillSha: controlTasks.skillSha,
  model: controlTasks.model,
  effort: controlTasks.effort,
};

function savedProgress(progress: CodexProgress | undefined) {
  if (!progress) return {};
  return {
    codexProgress: sql`case
      when coalesce((${controlTasks.codexProgress}->>'revision')::bigint, 0) < ${progress.revision}
      then ${JSON.stringify(progress)}::jsonb else ${controlTasks.codexProgress} end`,
  };
}

async function expireLeases(
  db: Pick<ReturnType<typeof getDatabase>, "update">,
  organizationId: number,
) {
  await db
    .update(controlTasks)
    .set({
      status: "failed",
      failure: "expired",
      finishedAt: now,
      leaseId: null,
      leaseExpiresAt: null,
    })
    .where(
      and(
        eq(controlTasks.organizationId, organizationId),
        eq(controlTasks.status, "running"),
        lte(controlTasks.leaseExpiresAt, now),
      ),
    );
}

export async function getRunnerPresence(organizationId: number) {
  const db = getDatabase();
  await expireLeases(db, organizationId);
  const [runner] = await db
    .select({
      lastSeenAt: controlRunners.lastSeenAt,
      readiness: controlRunners.readiness,
      offline: sql<boolean>`${controlRunners.lastSeenAt} <= ${cutoff}`,
    })
    .from(controlRunners)
    .where(eq(controlRunners.organizationId, organizationId));
  return runner ?? null;
}

export async function pollRunner(organizationId: number, input: RunnerPoll) {
  return getDatabase().transaction(async (tx) => {
    const runnerScope = eq(controlRunners.organizationId, organizationId);
    await tx
      .insert(controlRunners)
      .values({
        organizationId,
        instanceId: input.instanceId,
        readiness: input.readiness,
        lastSeenAt: now,
      })
      .onConflictDoNothing();

    // Updating the runner row serializes claims, renewals, and completion within this organization.
    const [owner] = await tx
      .update(controlRunners)
      .set({ instanceId: input.instanceId, readiness: input.readiness, lastSeenAt: now })
      .where(
        and(
          runnerScope,
          or(
            eq(controlRunners.instanceId, input.instanceId),
            lte(controlRunners.lastSeenAt, cutoff),
          ),
        ),
      )
      .returning({ instanceId: controlRunners.instanceId });
    if (!owner) return null;

    await expireLeases(tx, organizationId);

    const taskScope = eq(controlTasks.organizationId, organizationId);
    const [running] = await tx
      .select({ id: controlTasks.id, leaseId: controlTasks.leaseId })
      .from(controlTasks)
      .where(and(taskScope, eq(controlTasks.status, "running")))
      .limit(1);

    if (running) {
      if (input.leaseId && input.leaseId !== running.leaseId) return null;
      // An idle poll from the same instance can recover a lost initial claim response.
      const [renewed] = await tx
        .update(controlTasks)
        .set({ leaseExpiresAt: nextExpiry, ...savedProgress(input.progress) })
        .where(
          and(
            taskScope,
            eq(controlTasks.id, running.id),
            eq(controlTasks.status, "running"),
            gt(controlTasks.leaseExpiresAt, now),
          ),
        )
        .returning(jobColumns);
      return renewed ? { job: runnerJobSchema.parse(renewed) } : null;
    }
    if (input.leaseId) return null;
    if (input.readiness !== "ready") return { job: null };

    const [connection] = await tx
      .select({
        repositoryId: githubConnections.repositoryId,
        owner: githubConnections.owner,
        name: githubConnections.name,
      })
      .from(githubConnections)
      .where(
        and(isNotNull(githubConnections.webhookId), ne(githubConnections.status, "disconnecting")),
      )
      .for("share");
    if (
      !connection?.repositoryId ||
      !connection.owner ||
      !connection.name ||
      `${connection.owner}/${connection.name}`.toLowerCase() !== input.repositoryName?.toLowerCase()
    ) {
      await tx.update(controlRunners).set({ readiness: "checkout" }).where(runnerScope);
      return { job: null };
    }

    const [next] = await tx
      .select({ id: controlTasks.id })
      .from(controlTasks)
      .where(
        and(
          taskScope,
          eq(controlTasks.repositoryId, connection.repositoryId),
          eq(controlTasks.status, "queued"),
        ),
      )
      .orderBy(asc(controlTasks.createdAt), asc(controlTasks.id))
      .limit(1)
      .for("update");
    if (!next) return { job: null };

    const [claimed] = await tx
      .update(controlTasks)
      .set({ status: "running", startedAt: now, leaseId: randomUUID(), leaseExpiresAt: nextExpiry })
      .where(and(taskScope, eq(controlTasks.id, next.id), eq(controlTasks.status, "queued")))
      .returning(jobColumns);
    return { job: runnerJobSchema.parse(claimed) };
  });
}

export async function finishRunnerTask(organizationId: number, input: RunnerFinish) {
  return getDatabase().transaction(async (tx) => {
    const [owner] = await tx
      .select({ instanceId: controlRunners.instanceId })
      .from(controlRunners)
      .where(eq(controlRunners.organizationId, organizationId))
      .for("update");
    if (owner?.instanceId !== input.instanceId) return false;

    const claim = and(
      eq(controlTasks.organizationId, organizationId),
      eq(controlTasks.id, input.taskId),
      eq(controlTasks.leaseId, input.leaseId),
    );
    const [finished] = await tx
      .update(controlTasks)
      .set({
        status: input.result.status,
        failure: input.result.status === "failed" ? input.result.reason : null,
        finishedAt: now,
        leaseExpiresAt: null,
        ...savedProgress(input.progress),
      })
      .where(and(claim, eq(controlTasks.status, "running"), gt(controlTasks.leaseExpiresAt, now)))
      .returning({ id: controlTasks.id });
    if (finished) return true;

    const [previous] = await tx
      .select({ id: controlTasks.id })
      .from(controlTasks)
      .where(and(claim, eq(controlTasks.status, input.result.status)));
    return Boolean(previous);
  });
}
