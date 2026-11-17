import { encryptSecret } from "../secrets.server";
import type { GitHubConnection } from "~/control/db/schema/github";

export const KEY = Buffer.alloc(32, 7).toString("base64");
export const TOKEN = "github_pat_unit_test";
export const CONNECTION_ID = "ba211ae0-4195-49f9-809b-1ac590938233";
export const SYNC_ID = "6270d7be-e84d-43ee-9e66-6c469078ea42";
export const DELIVERY_ID = "c93683d4-5d71-46c5-bb50-6ce22572b303";
export const REPOSITORY = {
  id: 123,
  name: "blueprint",
  full_name: "owner/blueprint",
  html_url: "https://github.com/owner/blueprint",
  owner: { login: "owner" },
};
export function issue(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    number: 1,
    title: "Example issue",
    body: "Description",
    state: "open",
    state_reason: null,
    user: { id: 2, login: "author" },
    assignees: [{ id: 3, login: "assignee" }],
    labels: [{ id: 4, name: "bug", color: "ff0000" }],
    html_url: "https://github.com/owner/blueprint/issues/1",
    created_at: "2026-01-01T10:00:00Z",
    updated_at: "2026-01-02T10:00:00Z",
    closed_at: null,
    ...overrides,
  };
}
export function pull(overrides: Record<string, unknown> = {}) {
  return {
    ...issue(),
    id: 20,
    title: "Example PR",
    draft: false,
    merged_at: null,
    head: { ref: "feature" },
    base: { ref: "main" },
    html_url: "https://github.com/owner/blueprint/pull/1",
    ...overrides,
  };
}
export function run(overrides: Record<string, unknown> = {}) {
  return {
    id: 30,
    workflow_id: 9,
    run_number: 7,
    run_attempt: 1,
    name: "CI",
    display_title: "Build",
    status: "completed",
    conclusion: "success",
    event: "push",
    head_branch: "main",
    head_sha: "abc123",
    html_url: "https://github.com/owner/blueprint/actions/runs/30",
    created_at: "2026-01-01T10:00:00Z",
    updated_at: "2026-01-02T10:00:00Z",
    run_started_at: "2026-01-01T10:00:01Z",
    ...overrides,
  };
}
export function connection(overrides: Partial<GitHubConnection> = {}): GitHubConnection {
  return {
    id: CONNECTION_ID,
    slot: 1,
    login: "owner",
    repositoryId: 123,
    owner: "owner",
    name: "blueprint",
    url: REPOSITORY.html_url,
    encryptedToken: encryptSecret(TOKEN),
    encryptedWebhookSecret: encryptSecret("hook-secret"),
    webhookId: 42,
    webhookUrl: `https://control.example/webhooks/github?connection=${CONNECTION_ID}`,
    status: "connected",
    syncId: null,
    syncCursor: null,
    lastSyncedAt: null,
    lastWebhookAt: null,
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
