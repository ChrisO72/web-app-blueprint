import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubClient, GitHubApiError } from "~/integrations/github/client.server";
import { decryptSecret } from "~/integrations/github/secrets.server";
import {
  saveToken,
  connectRepository,
  requestSync,
  replaceToken,
  disconnect,
} from "../github.server";
import {
  getConnection,
  createDraft,
  updateConnection,
  beginConnecting,
  removeConnection,
} from "../db/repositories/github.server";
import { enqueueGithubSync } from "~/worker/jobs/sync-github";
import {
  KEY,
  TOKEN,
  CONNECTION_ID,
  REPOSITORY,
  connection,
} from "~/integrations/github/test/fixtures";
import type { GitHubConnection } from "../db/schema/github";

vi.mock("../db/repositories/github.server", () => ({
  getConnection: vi.fn(),
  getPublicConnection: vi.fn(),
  createDraft: vi.fn(),
  updateConnection: vi.fn(),
  beginConnecting: vi.fn(),
  removeConnection: vi.fn(),
  connectionOperationTimeout: 120_000,
}));
vi.mock("~/worker/jobs/sync-github", () => ({ enqueueGithubSync: vi.fn() }));
let current: GitHubConnection | null;
let order: string[];
beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.stubEnv("CONTROL_ENCRYPTION_KEY", KEY);
  vi.stubEnv("APP_URL", "https://control.example");
  current = connection();
  order = [];
  vi.mocked(getConnection).mockImplementation(async () => current);
  vi.mocked(updateConnection).mockImplementation(async (_id, values) =>
    Object.assign(current ?? connection(), values),
  );
  vi.mocked(beginConnecting).mockImplementation(async (_id, values) =>
    Object.assign(current ?? connection(), values, { status: "connecting" as const }),
  );
  vi.mocked(enqueueGithubSync).mockImplementation(async () => {
    order.push("enqueue");
  });
  vi.spyOn(GitHubClient.prototype, "identity").mockResolvedValue("owner");
  vi.spyOn(GitHubClient.prototype, "repositories").mockResolvedValue([REPOSITORY]);
  vi.spyOn(GitHubClient.prototype, "repository").mockResolvedValue(REPOSITORY);
  vi.spyOn(GitHubClient.prototype, "checkReadPermissions").mockResolvedValue();
  vi.spyOn(GitHubClient.prototype, "hooks").mockResolvedValue([]);
  vi.spyOn(GitHubClient.prototype, "saveHook").mockImplementation(async (_owner, _name, url) => {
    order.push("hook");
    return { id: 42, config: { url } };
  });
  vi.spyOn(GitHubClient.prototype, "deleteHook").mockResolvedValue();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("GitHub connection lifecycle", () => {
  it("validates the token before storing it encrypted", async () => {
    current = null;
    await saveToken(TOKEN);
    const [, encrypted] = vi.mocked(createDraft).mock.calls[0];
    expect(encrypted).not.toContain(TOKEN);
    expect(decryptSecret(encrypted)).toBe(TOKEN);
    expect(GitHubClient.prototype.identity).toHaveBeenCalledOnce();
  });
  it("does not persist an invalid token", async () => {
    current = null;
    vi.mocked(GitHubClient.prototype.identity).mockRejectedValue(new GitHubApiError(401));
    await expect(saveToken(TOKEN)).rejects.toMatchObject({ status: 401 });
    expect(createDraft).not.toHaveBeenCalled();
  });
  it("creates the webhook before enqueueing the initial import", async () => {
    current = connection({
      repositoryId: null,
      owner: null,
      name: null,
      url: null,
      webhookId: null,
      webhookUrl: null,
      encryptedWebhookSecret: null,
      status: "draft",
    });
    await connectRepository(CONNECTION_ID, 123);
    expect(order).toEqual(["hook", "enqueue"]);
    expect(current).toMatchObject({ repositoryId: 123, webhookId: 42, status: "syncing" });
    expect(enqueueGithubSync).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "full", connectionId: CONNECTION_ID }),
    );
    expect(JSON.stringify(vi.mocked(enqueueGithubSync).mock.calls)).not.toContain(TOKEN);
  });
  it("rejects missing read permissions before registering a webhook", async () => {
    current = connection({ webhookId: null, status: "draft" });
    vi.mocked(GitHubClient.prototype.checkReadPermissions).mockRejectedValue(
      new GitHubApiError(403),
    );
    await expect(connectRepository(CONNECTION_ID, 123)).rejects.toMatchObject({ status: 403 });
    expect(GitHubClient.prototype.saveHook).not.toHaveBeenCalled();
    expect(enqueueGithubSync).not.toHaveBeenCalled();
  });
  it("recovers an already-created webhook only by its connection-specific URL", async () => {
    current = connection({ webhookId: null, status: "error" });
    vi.mocked(GitHubClient.prototype.hooks).mockResolvedValue([
      { id: 99, config: { url: "https://other.example/hook" } },
      { id: 42, config: { url: current.webhookUrl ?? "" } },
    ]);
    await connectRepository(CONNECTION_ID, 123);
    expect(GitHubClient.prototype.saveHook).toHaveBeenCalledWith(
      "owner",
      "blueprint",
      expect.stringContaining(CONNECTION_ID),
      "hook-secret",
      42,
    );
  });
  it("can recover an interrupted connection after its operation deadline", async () => {
    current = connection({
      webhookId: null,
      status: "connecting",
      updatedAt: new Date(Date.now() - 180_000),
    });
    await connectRepository(CONNECTION_ID, 123);
    expect(current?.status).toBe("syncing");
  });
  it("blocks overlapping connection operations", async () => {
    current = connection({ webhookId: null, status: "connecting", updatedAt: new Date() });
    await expect(connectRepository(CONNECTION_ID, 123)).rejects.toThrow("already in progress");
    expect(GitHubClient.prototype.saveHook).not.toHaveBeenCalled();
  });
  it("keeps the encrypted token when replacement validation fails", async () => {
    const original = current?.encryptedToken;
    vi.mocked(GitHubClient.prototype.identity).mockRejectedValue(new GitHubApiError(401));
    await expect(replaceToken(CONNECTION_ID, "new-token")).rejects.toMatchObject({ status: 401 });
    expect(current?.encryptedToken).toBe(original);
    expect(updateConnection).not.toHaveBeenCalled();
  });
  it("replaces credentials while preserving the selected repository and webhook", async () => {
    await replaceToken(CONNECTION_ID, "new-token");
    expect(current).toMatchObject({ repositoryId: 123, webhookId: 42 });
    expect(decryptSecret(current?.encryptedToken ?? "")).toBe("new-token");
    expect(GitHubClient.prototype.saveHook).toHaveBeenCalledWith(
      "owner",
      "blueprint",
      current?.webhookUrl,
      "hook-secret",
      42,
    );
  });
  it("keeps connection and cached records if remote disconnect fails", async () => {
    vi.mocked(GitHubClient.prototype.deleteHook).mockRejectedValue(new GitHubApiError(403));
    await expect(disconnect(CONNECTION_ID)).rejects.toMatchObject({ status: 403 });
    expect(removeConnection).not.toHaveBeenCalled();
    expect(current?.status).toBe("error");
  });
  it("removes only its own hook before clearing the connection and mirrored rows", async () => {
    await disconnect(CONNECTION_ID);
    expect(GitHubClient.prototype.deleteHook).toHaveBeenCalledWith("owner", "blueprint", 42);
    expect(GitHubClient.prototype.hooks).not.toHaveBeenCalled();
    expect(removeConnection).toHaveBeenCalledWith(CONNECTION_ID);
  });
  it("allows manual retry after a failed initial enqueue", async () => {
    vi.mocked(enqueueGithubSync).mockRejectedValueOnce(new Error("Redis unavailable"));
    await expect(requestSync(CONNECTION_ID)).rejects.toThrow("Redis unavailable");
    expect(current?.status).toBe("error");
    await requestSync(CONNECTION_ID);
    expect(current?.status).toBe("syncing");
    expect(enqueueGithubSync).toHaveBeenCalledTimes(2);
  });
});
