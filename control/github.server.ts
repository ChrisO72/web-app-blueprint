import { randomBytes, randomUUID } from "node:crypto";
import { GitHubClient, GitHubApiError, repoPath } from "~/integrations/github/client.server";
import {
  decryptSecret,
  encryptSecret,
  GitHubSetupError,
  setupStatus,
  webhookUrl,
} from "~/integrations/github/secrets.server";
import {
  createDraft,
  getConnection,
  getPublicConnection,
  beginConnecting,
  updateConnection,
  removeConnection,
  connectionOperationTimeout,
} from "./db/repositories/github.server";
import { enqueueGithubSync } from "~/worker/jobs/sync-github";
import type { GitHubConnection } from "./db/schema/github";

export function publicError(error: unknown) {
  return error instanceof GitHubApiError || error instanceof GitHubSetupError
    ? error.message
    : "The GitHub operation could not be completed. Please try again.";
}
export async function settingsData() {
  const setup = setupStatus();
  const connection = await getPublicConnection();
  let repositories: { id: number; fullName: string }[] = [];
  let error: string | null = null;
  if (connection && !connection.repositoryId && setup.ready) {
    try {
      const stored = await getConnection();
      if (stored?.id === connection.id)
        repositories = (
          await new GitHubClient(decryptSecret(stored.encryptedToken)).repositories()
        ).map((repo) => ({ id: repo.id, fullName: repo.full_name }));
    } catch (cause) {
      error = publicError(cause);
    }
  }
  return { setup, connection, repositories, error };
}

export async function saveToken(token: string) {
  webhookUrl();
  const encryptedToken = encryptSecret(token);
  const current = await getConnection();
  if (current?.repositoryId)
    throw new GitHubSetupError("Use Replace token for the connected repository.");
  const client = new GitHubClient(token);
  const login = await client.identity();
  await client.repositories();
  await createDraft(login, encryptedToken);
}

async function currentConnection(id: string, recoverInterrupted = false) {
  const current = await getConnection();
  if (!current || current.id !== id)
    throw new GitHubSetupError("The connection changed. Reload Settings and try again.");
  if (
    (current.status === "disconnecting" || current.status === "connecting") &&
    (!recoverInterrupted || current.updatedAt.getTime() > Date.now() - connectionOperationTimeout)
  )
    throw new GitHubSetupError(
      "A connection operation is already in progress. Retry in two minutes if it was interrupted.",
    );
  return current;
}

function connectedRepository(connection: GitHubConnection) {
  if (!connection.owner || !connection.name || !connection.repositoryId)
    throw new GitHubSetupError("Select a repository first.");
  return { owner: connection.owner, name: connection.name };
}

export async function connectRepository(id: string, repositoryId: number) {
  const current = await currentConnection(id, true);
  if (current.webhookId)
    throw new GitHubSetupError("Disconnect the current repository before connecting another.");
  if (current.repositoryId && current.repositoryId !== repositoryId)
    throw new GitHubSetupError("Finish or disconnect the current repository connection first.");
  const client = new GitHubClient(decryptSecret(current.encryptedToken));
  const selected = (await client.repositories()).find((repo) => repo.id === repositoryId);
  if (!selected) throw new GitHubSetupError("This token cannot access the selected repository.");
  const repository = await client.repository(selected.owner.login, selected.name);
  if (repository.id !== selected.id)
    throw new GitHubSetupError("The selected repository changed. Refresh the repository list.");
  await client.checkReadPermissions(repository.owner.login, repository.name);
  const secret = current.encryptedWebhookSecret
    ? decryptSecret(current.encryptedWebhookSecret)
    : randomBytes(32).toString("hex");
  const url = current.webhookUrl ? new URL(current.webhookUrl) : new URL(webhookUrl());
  url.searchParams.set("connection", current.id);
  const pending = await beginConnecting(current.id, {
    repositoryId: repository.id,
    owner: repository.owner.login,
    name: repository.name,
    url: repository.html_url,
    encryptedWebhookSecret: encryptSecret(secret),
    webhookUrl: url.toString(),
  });
  if (!pending) throw new GitHubSetupError("A connection operation is already in progress.");
  try {
    const existing = (await client.hooks(repository.owner.login, repository.name)).find(
      (hook) => hook.config.url === url.toString(),
    );
    const hook = await client.saveHook(
      repository.owner.login,
      repository.name,
      url.toString(),
      secret,
      existing?.id,
    );
    await updateConnection(id, { webhookId: hook.id, status: "connected" });
  } catch (error) {
    await updateConnection(id, { status: "error", lastError: publicError(error) });
    throw error;
  }
  await requestSync(id);
}

export async function requestSync(id: string) {
  const current = await currentConnection(id);
  const repo = connectedRepository(current);
  if (!current.webhookId)
    throw new GitHubSetupError("Connect the repository webhook before syncing.");
  if (current.status === "syncing") return;
  const syncId = randomUUID();
  await updateConnection(id, {
    status: "syncing",
    syncId,
    syncCursor: {
      kind: "issue",
      path: `${repoPath(repo.owner, repo.name)}/issues?state=all&per_page=100`,
    },
    lastError: null,
  });
  try {
    await enqueueGithubSync({ kind: "full", connectionId: id, syncId });
  } catch (error) {
    await updateConnection(id, {
      status: "error",
      lastError: "The import could not be queued. Use Sync now to retry.",
    });
    throw error;
  }
}

export async function replaceToken(id: string, token: string) {
  const current = await currentConnection(id, true);
  const client = new GitHubClient(token);
  const encryptedToken = encryptSecret(token);
  const login = await client.identity();
  if (current.repositoryId) {
    const repo = connectedRepository(current);
    const repository = await client.repository(repo.owner, repo.name);
    if (repository.id !== current.repositoryId)
      throw new GitHubSetupError("The repository no longer matches this connection.");
    await client.checkReadPermissions(repo.owner, repo.name);
    if (current.webhookId && current.encryptedWebhookSecret && current.webhookUrl)
      await client.saveHook(
        repo.owner,
        repo.name,
        current.webhookUrl,
        decryptSecret(current.encryptedWebhookSecret),
        current.webhookId,
      );
  } else await client.repositories();
  await updateConnection(id, {
    encryptedToken,
    login,
    lastError: null,
    ...(["connecting", "disconnecting"].includes(current.status)
      ? { status: "error" as const }
      : {}),
  });
}

export async function disconnect(id: string) {
  const current = await currentConnection(id, true);
  await updateConnection(id, { status: "disconnecting", syncId: null });
  try {
    if (current.repositoryId) {
      const repo = connectedRepository(current);
      const client = new GitHubClient(decryptSecret(current.encryptedToken));
      const hookId =
        current.webhookId ??
        (await client.hooks(repo.owner, repo.name)).find(
          (hook) => hook.config.url === current.webhookUrl,
        )?.id;
      if (hookId) await client.deleteHook(repo.owner, repo.name, hookId);
    }
    await removeConnection(id);
  } catch (error) {
    await updateConnection(id, {
      status: "error",
      lastError:
        "Disconnect failed. Replace the token if needed, then retry. Cached records have been kept.",
    });
    throw error;
  }
}
