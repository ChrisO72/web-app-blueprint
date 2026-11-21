import { describe, expect, it } from "vitest";
import { isPullIssue, normalizeIssue, normalizePull, normalizeRun } from "../records";
import { issue, pull, run } from "./fixtures";

describe("GitHub metadata", () => {
  it("keeps core issue fields and unknown raw metadata without credential fields", () => {
    const input = issue({
      state: "closed",
      state_reason: "completed",
      future_field: { value: true, temp_clone_token: "never-store" },
    });
    const row = normalizeIssue(input);
    expect(row).toMatchObject({
      number: 1,
      description: "Description",
      state: "closed",
      stateReason: "completed",
      labels: [{ name: "bug" }],
      author: { login: "author" },
    });
    expect(row.raw.future_field).toEqual({ value: true });
    expect(row.raw.created_at).toBe(input.created_at);
    expect(isPullIssue(issue({ pull_request: { url: "https://api.github.com/pulls/1" } }))).toBe(
      true,
    );
    expect(isPullIssue(input)).toBe(false);
  });
  it("preserves closed, merged and draft PR data and branches", () => {
    expect(
      normalizePull(pull({ state: "closed", merged_at: "2026-01-03T10:00:00Z" })),
    ).toMatchObject({
      state: "closed",
      mergedAt: new Date("2026-01-03T10:00:00Z"),
      headBranch: "feature",
      baseBranch: "main",
    });
    expect(normalizePull(pull({ draft: true })).draft).toBe(true);
  });
  it("preserves workflow run attempts, outcomes and full JSON", () => {
    const row = normalizeRun(run({ run_attempt: 2, conclusion: "failure", extra: ["metadata"] }));
    expect(row).toMatchObject({
      githubId: 30,
      runAttempt: 2,
      status: "completed",
      conclusion: "failure",
      branch: "main",
      commitSha: "abc123",
    });
    expect(row.raw.extra).toEqual(["metadata"]);
  });
});
