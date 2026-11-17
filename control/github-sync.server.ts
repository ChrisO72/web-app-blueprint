import { GitHubClient, GitHubApiError, repoPath } from "~/integrations/github/client.server";
import { decryptSecret } from "~/integrations/github/secrets.server";
import { isPullIssue, normalizePull } from "~/integrations/github/records";
import {
  getConnection,
  progressSync,
  updateConnection,
  upsertRecord,
  markUnavailable,
  syncError,
} from "./db/repositories/github.server";
import type { GitHubSyncJobData } from "~/worker/jobs/sync-github";

function syncMessage(error: unknown) {
  return error instanceof GitHubApiError
    ? error.message
    : "GitHub sync failed. Use Sync now to retry.";
}
export async function syncGithub(data: GitHubSyncJobData) {
  const current = await getConnection();
  if (
    !current ||
    current.id !== data.connectionId ||
    !current.owner ||
    !current.name ||
    !current.webhookId ||
    current.status === "disconnecting"
  )
    return;
  if (data.kind === "full" && current.syncId !== data.syncId) return;
  const base = repoPath(current.owner, current.name);
  try {
    const client = new GitHubClient(decryptSecret(current.encryptedToken));
    if (data.kind === "record") {
      if (data.deleted) {
        await markUnavailable(current.id, data.recordKind, data.githubId);
        return;
      }
      const path =
        data.recordKind === "run"
          ? `${base}/actions/runs/${data.githubId}`
          : `${base}/${data.recordKind === "issue" ? "issues" : "pulls"}/${data.number}`;
      try {
        const { data: value } = await client.request(path);
        await upsertRecord(current.id, data.recordKind, value);
      } catch (error) {
        if (!(error instanceof GitHubApiError) || error.status !== 404) throw error;
        await markUnavailable(current.id, data.recordKind, data.githubId);
      }
      return;
    }
    await updateConnection(current.id, { status: "syncing", lastError: null });
    let cursor = current.syncCursor ?? {
      kind: "issue" as const,
      path: `${base}/issues?state=all&per_page=100`,
    };
    for (;;) {
      const latest = await getConnection();
      if (
        !latest ||
        latest.id !== current.id ||
        latest.syncId !== data.syncId ||
        latest.status === "disconnecting"
      )
        return;
      const page = await client.page(
        cursor.path,
        cursor.kind === "run" ? "workflow_runs" : undefined,
      );
      for (const value of page.items) {
        if (cursor.kind === "issue" && isPullIssue(value)) continue;
        if (cursor.kind === "pull") {
          const pull = normalizePull(value);
          try {
            const { data: detail } = await client.request(`${base}/pulls/${pull.number}`);
            await upsertRecord(current.id, "pull", detail);
          } catch (error) {
            if (!(error instanceof GitHubApiError) || error.status !== 404) throw error;
            await markUnavailable(current.id, "pull", pull.githubId);
          }
        } else await upsertRecord(current.id, cursor.kind, value);
      }
      const next = page.next
        ? { ...cursor, path: page.next }
        : cursor.kind === "issue"
          ? { kind: "pull" as const, path: `${base}/pulls?state=all&per_page=100` }
          : cursor.kind === "pull"
            ? { kind: "run" as const, path: `${base}/actions/runs?per_page=100` }
            : null;
      await progressSync(current.id, data.syncId, next, !next);
      if (!next) return;
      cursor = next;
    }
  } catch (error) {
    await syncError(current.id, data.kind === "full" ? data.syncId : undefined, syncMessage(error));
    throw error;
  }
}
