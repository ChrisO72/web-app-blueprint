import { createHash } from "node:crypto";
import { getConnection } from "./db/repositories/github.server";
import { GitHubClient } from "~/integrations/github/client.server";
import { GitHubDocsClient } from "~/integrations/github/docs.server";
import { decryptSecret, GitHubSetupError } from "~/integrations/github/secrets.server";

async function connectedDocs() {
  const connection = await getConnection();
  if (
    !connection?.webhookId ||
    !connection.owner ||
    !connection.name ||
    connection.status === "disconnecting"
  )
    throw new GitHubSetupError(
      "Connect a GitHub repository in Control Settings to browse its documentation.",
    );
  const client = new GitHubDocsClient(
    new GitHubClient(decryptSecret(connection.encryptedToken)),
    connection.owner,
    connection.name,
  );
  const snapshot = await client.snapshot();
  if (snapshot.id !== connection.repositoryId)
    throw new GitHubSetupError("The connected repository changed. Check Control Settings.");
  return { client, snapshot, connectionId: connection.id };
}

export async function loadDocuments(requested: string | null) {
  const { client, snapshot, connectionId } = await connectedDocs();
  const entries = await client.documents(snapshot.tree);
  const paths = entries.map((entry) => entry.path).sort();
  const path = requested ?? paths.find((path) => /^readme\.md$/i.test(path)) ?? paths[0];
  const entry = entries.find((entry) => entry.path === path);
  return {
    connectionId,
    repositoryId: snapshot.id,
    branch: snapshot.branch,
    repositoryUrl: snapshot.url,
    paths,
    document: entry
      ? { path: entry.path, sha: entry.sha, source: await client.source(entry.sha) }
      : null,
    message: entry
      ? null
      : requested
        ? "This file is no longer on the default branch."
        : "This repository has no Markdown files.",
  };
}

export type Proposal = {
  connectionId: string;
  repositoryId: number;
  branch: string;
  path: string;
  sha: string;
  operation: string;
  source: string;
  title: string;
};

export async function proposeDocument(input: Proposal) {
  const { client, snapshot, connectionId } = await connectedDocs();
  if (
    connectionId !== input.connectionId ||
    snapshot.id !== input.repositoryId ||
    snapshot.branch !== input.branch
  )
    throw new GitHubSetupError(
      "The repository or default branch changed. Copy your draft and reopen the document.",
    );
  const digest = createHash("sha256")
    .update(
      JSON.stringify([
        connectionId,
        input.operation,
        input.branch,
        input.path,
        input.sha,
        input.source,
        input.title,
      ]),
    )
    .digest("hex");
  const branch = "control/docs-" + digest;
  if (branch === snapshot.branch)
    throw new GitHubSetupError("The proposal branch matches the default branch.");
  const existing = await client.findPull(branch, snapshot.branch);
  if (existing) return existing;
  const entries = await client.documents(snapshot.tree);
  const entry = entries.find((entry) => entry.path === input.path);
  if (!entry || entry.sha !== input.sha)
    throw new GitHubSetupError(
      "This file changed on GitHub. Copy your draft, reopen the latest version, and reapply your changes.",
    );
  if ((await client.source(entry.sha)) === input.source)
    throw new GitHubSetupError("Edit the document before opening a pull request.");
  return client.publish(snapshot, entry, input.source, input.title, branch);
}
