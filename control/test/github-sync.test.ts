import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncGithub } from "../github-sync.server";
import { GitHubClient, GitHubApiError } from "~/integrations/github/client.server";
import {
  getConnection,
  progressSync,
  updateConnection,
  upsertRecord,
  markUnavailable,
  syncError,
} from "../db/repositories/github.server";
import {
  KEY,
  CONNECTION_ID,
  SYNC_ID,
  connection,
  issue,
  pull,
  run,
} from "~/integrations/github/test/fixtures";

vi.mock("../db/repositories/github.server", () => ({
  getConnection: vi.fn(),
  progressSync: vi.fn(),
  updateConnection: vi.fn(),
  upsertRecord: vi.fn(),
  markUnavailable: vi.fn(),
  syncError: vi.fn(),
}));
beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.stubEnv("CONTROL_ENCRYPTION_KEY", KEY);
  vi.mocked(getConnection).mockResolvedValue(
    connection({
      status: "syncing",
      syncId: SYNC_ID,
      syncCursor: { kind: "issue", path: "/repos/owner/blueprint/issues?state=all&per_page=100" },
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe("GitHub synchronization", () => {
  it("imports every page and every state, excluding PRs from issue rows", async () => {
    vi.spyOn(GitHubClient.prototype, "request").mockResolvedValue({
      data: pull({ state: "closed", merged_at: "2026-01-02T12:00:00Z", additions: 42 }),
      response: new Response(),
    });
    const page = vi
      .spyOn(GitHubClient.prototype, "page")
      .mockResolvedValueOnce({
        items: [issue(), issue({ id: 11, pull_request: {} })],
        next: "/issue-page-2",
      })
      .mockResolvedValueOnce({ items: [issue({ id: 12, state: "closed" })], next: null })
      .mockResolvedValueOnce({
        items: [pull({ state: "closed", merged_at: "2026-01-02T12:00:00Z" })],
        next: null,
      })
      .mockResolvedValueOnce({ items: [run()], next: "/run-page-2" })
      .mockResolvedValueOnce({ items: [run({ id: 31 })], next: null });
    await syncGithub({ kind: "full", connectionId: CONNECTION_ID, syncId: SYNC_ID });
    expect(page.mock.calls.map(([path]) => path)).toEqual([
      "/repos/owner/blueprint/issues?state=all&per_page=100",
      "/issue-page-2",
      "/repos/owner/blueprint/pulls?state=all&per_page=100",
      "/repos/owner/blueprint/actions/runs?per_page=100",
      "/run-page-2",
    ]);
    expect(upsertRecord).toHaveBeenCalledTimes(5);
    expect(GitHubClient.prototype.request).toHaveBeenCalledWith("/repos/owner/blueprint/pulls/1");
    expect(upsertRecord).toHaveBeenCalledWith(
      CONNECTION_ID,
      "pull",
      expect.objectContaining({ additions: 42 }),
    );
    expect(vi.mocked(upsertRecord).mock.calls.map(([, kind]) => kind)).toEqual([
      "issue",
      "issue",
      "pull",
      "run",
      "run",
    ]);
    expect(progressSync).toHaveBeenLastCalledWith(CONNECTION_ID, SYNC_ID, null, true);
  });
  it("resumes at the saved cursor after a rate limit rather than restarting history", async () => {
    vi.mocked(getConnection).mockResolvedValue(
      connection({
        syncId: SYNC_ID,
        status: "error",
        syncCursor: { kind: "run", path: "/saved-run-page" },
      }),
    );
    const page = vi
      .spyOn(GitHubClient.prototype, "page")
      .mockRejectedValueOnce(new GitHubApiError(429, 60_000));
    await expect(
      syncGithub({ kind: "full", connectionId: CONNECTION_ID, syncId: SYNC_ID }),
    ).rejects.toMatchObject({ retryAfterMs: 60_000 });
    expect(syncError).toHaveBeenCalled();
    expect(progressSync).not.toHaveBeenCalled();
    page.mockResolvedValueOnce({ items: [run()], next: null });
    await syncGithub({ kind: "full", connectionId: CONNECTION_ID, syncId: SYNC_ID });
    expect(page.mock.calls.every(([path]) => path === "/saved-run-page")).toBe(true);
  });
  it("ignores jobs from an old or disconnected connection", async () => {
    const request = vi.spyOn(GitHubClient.prototype, "request");
    await syncGithub({ kind: "full", connectionId: CONNECTION_ID, syncId: "old-sync" });
    vi.mocked(getConnection).mockResolvedValue(null);
    await syncGithub({
      kind: "record",
      connectionId: CONNECTION_ID,
      recordKind: "issue",
      githubId: 10,
      number: 1,
      deleted: false,
    });
    expect(request).not.toHaveBeenCalled();
    expect(upsertRecord).not.toHaveBeenCalled();
  });
  it("refetches current GitHub data rather than trusting delayed webhook snapshots", async () => {
    vi.spyOn(GitHubClient.prototype, "request").mockResolvedValue({
      data: issue({ state: "closed" }),
      response: new Response(),
    });
    await syncGithub({
      kind: "record",
      connectionId: CONNECTION_ID,
      recordKind: "issue",
      githubId: 10,
      number: 1,
      deleted: false,
    });
    expect(upsertRecord).toHaveBeenCalledWith(
      CONNECTION_ID,
      "issue",
      expect.objectContaining({ state: "closed" }),
    );
    expect(updateConnection).not.toHaveBeenCalled();
  });
  it("marks deleted and unavailable records without removing their metadata", async () => {
    const request = vi
      .spyOn(GitHubClient.prototype, "request")
      .mockRejectedValue(new GitHubApiError(404));
    await syncGithub({
      kind: "record",
      connectionId: CONNECTION_ID,
      recordKind: "issue",
      githubId: 10,
      number: 1,
      deleted: true,
    });
    expect(request).not.toHaveBeenCalled();
    await syncGithub({
      kind: "record",
      connectionId: CONNECTION_ID,
      recordKind: "run",
      githubId: 30,
      number: 30,
      deleted: false,
    });
    expect(markUnavailable).toHaveBeenCalledWith(CONNECTION_ID, "issue", 10);
    expect(markUnavailable).toHaveBeenCalledWith(CONNECTION_ID, "run", 30);
  });
});
