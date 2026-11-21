import { describe, expect, it } from "vitest";
import { codexArgs, codexEnvironment, gitHubRepository } from "~/control/runner/codex";
import { runnerConfigSchema } from "~/control/runner/config";
import type { RunnerJob } from "~/control/runner-protocol";

describe("runner Control URL", () => {
  const url = runnerConfigSchema.shape.CONTROL_RUNNER_URL;

  it.each([
    "https://control.example.com",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://[::1]:5173",
  ])("accepts %s", (value) => {
    expect(url.safeParse(value).success).toBe(true);
  });

  it.each([
    "http://control.example.com",
    "http://localhost.example.com",
    "http://192.168.0.10:5173",
    "http://localhost@control.example.com",
    "https://user:password@control.example.com",
    "localhost:5173",
  ])("rejects %s", (value) => {
    expect(url.safeParse(value).success).toBe(false);
  });
});

describe("local runner commands", () => {
  const job: RunnerJob = {
    id: "d5424b9e-de9d-4e62-8aed-2ef8e822a4a3",
    leaseId: "f56ca7cc-2606-4a1c-bcab-be411bb4f132",
    repositoryName: "owner/repo",
    targetKind: "pull",
    targetNumber: 10,
    targetUrl: "https://github.com/owner/repo/pull/10",
    skillPath: ".agents/skills/review/SKILL.md",
    skillSha: "a".repeat(40),
    model: "gpt-6.2-astra",
    effort: "xhigh",
  };

  it("passes the saved model and effort with the exact skill prompt and ChatGPT-only config", () => {
    const args = codexArgs(job, "/tmp/runner worktree", "review");
    expect(args).toContain('forced_login_method="chatgpt"');
    expect(args).toContain('model_reasoning_effort="xhigh"');
    expect(args.slice(args.indexOf("--cd"))).toEqual([
      "--cd",
      "/tmp/runner worktree",
      "--model",
      "gpt-6.2-astra",
      "Use $review on https://github.com/owner/repo/pull/10",
    ]);
  });

  it("passes local runtime settings and excludes runner and API credentials", () => {
    expect(
      codexEnvironment({
        PATH: "/usr/bin",
        CODEX_HOME: "/tmp/codex",
        CONTROL_RUNNER_SECRET: "runner",
        CODEX_API_KEY: "key",
        OPENAI_API_KEY: "key",
        CODEX_ACCESS_TOKEN: "token",
      }),
    ).toEqual({ PATH: "/usr/bin", CODEX_HOME: "/tmp/codex" });
  });

  it("recognizes the normal GitHub remote forms and rejects a lookalike host", () => {
    expect(gitHubRepository("https://github.com/owner/repo.git")).toBe("owner/repo");
    expect(gitHubRepository("git@github.com:owner/repo.git")).toBe("owner/repo");
    expect(gitHubRepository("ssh://git@github.com/owner/repo.git")).toBe("owner/repo");
    expect(gitHubRepository("https://github.com.example/owner/repo")).toBeNull();
  });
});
