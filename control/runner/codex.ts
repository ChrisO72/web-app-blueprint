import { execFile, spawn } from "node:child_process";
import { mkdir, realpath } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import type { RunnerFinish, RunnerJob } from "../runner-protocol";

const execute = promisify(execFile);
const chatGptConfig = ['forced_login_method="chatgpt"', 'model_provider="openai"'];
const environmentKeys = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TMPDIR",
  "TERM",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "SSH_AUTH_SOCK",
  "CODEX_HOME",
  "GH_CONFIG_DIR",
];
export type RunResult = RunnerFinish["result"];

function failed(reason: Extract<RunResult, { status: "failed" }>["reason"]): RunResult {
  return { status: "failed", reason };
}

export function codexEnvironment(env: NodeJS.ProcessEnv) {
  return Object.fromEntries(
    environmentKeys.map((key) => [key, env[key]]).filter(([, value]) => value !== undefined),
  );
}

export function codexArgs(job: RunnerJob, worktree: string, skillName: string) {
  return [
    ...chatGptConfig.flatMap((setting) => ["-c", setting]),
    "-c",
    `model_reasoning_effort="${job.effort}"`,
    "-a",
    "never",
    "exec",
    "--json",
    "--sandbox",
    "workspace-write",
    "--cd",
    worktree,
    "--model",
    job.model,
    `Use $${skillName} on ${job.targetUrl}`,
  ];
}

export function gitHubRepository(remote: string) {
  const match =
    /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([a-z0-9-]+\/[a-z0-9_.-]+)$/i.exec(
      remote.trim(),
    );
  return match?.[1].replace(/\.git$/i, "") ?? null;
}

function git(cwd: string, ...args: string[]) {
  return execute("git", args, { cwd, env: codexEnvironment(process.env), timeout: 10_000 }).then(
    ({ stdout }) => stdout.trim(),
  );
}

export async function checkoutRepository(checkout: string) {
  try {
    const root = await git(checkout, "rev-parse", "--show-toplevel");
    if ((await realpath(root)) !== (await realpath(checkout))) return null;
    return gitHubRepository(await git(checkout, "remote", "get-url", "origin"));
  } catch {
    return null;
  }
}

export async function signedIntoChatGpt() {
  try {
    const { stdout, stderr } = await execute(
      "codex",
      ["-c", chatGptConfig[0], "-c", chatGptConfig[1], "login", "status"],
      { env: codexEnvironment(process.env), timeout: 5_000 },
    );
    return /\blogged in using ChatGPT\b/i.test(stdout + "\n" + stderr);
  } catch {
    return false;
  }
}

const codexEvent = z.object({
  type: z.string(),
  message: z.string().optional(),
  error: z.object({ message: z.string() }).optional(),
});

function invokeCodex(args: string[], cwd: string, signal: AbortSignal): Promise<RunResult> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(failed("expired"));
      return;
    }
    const child = spawn("codex", args, {
      cwd,
      env: codexEnvironment(process.env),
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const lines = createInterface({ input: child.stdout });
    let errorText = "";
    let completed = false;
    let turnFailed = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    lines.on("line", (line) => {
      try {
        const parsed = codexEvent.safeParse(JSON.parse(line));
        if (!parsed.success) return;
        const event = parsed.data;
        if (event.type === "turn.completed") completed = true;
        if (event.type === "turn.failed") turnFailed = true;
        if (event.type === "turn.failed" || event.type === "error") {
          errorText = (errorText + "\n" + (event.error?.message ?? event.message ?? "")).slice(
            -8192,
          );
        }
      } catch {
        // Codex can emit non-JSON diagnostics alongside its events.
      }
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      errorText = (errorText + "\n" + chunk).slice(-8192);
    });

    function killGroup(signal: NodeJS.Signals) {
      if (!child.pid) return;
      try {
        process.kill(-child.pid, signal);
      } catch {
        // The process group may already have exited.
      }
    }
    function abort() {
      killGroup("SIGTERM");
      killTimer = setTimeout(() => killGroup("SIGKILL"), 1000);
    }
    signal.addEventListener("abort", abort, { once: true });
    child.once("error", () => {
      turnFailed = true;
    });
    child.once("close", (code) => {
      signal.removeEventListener("abort", abort);
      clearTimeout(killTimer);
      lines.close();
      if (signal.aborted) {
        killGroup("SIGKILL");
        resolve(failed("expired"));
      } else if (code === 0 && completed && !turnFailed) {
        resolve({ status: "done" });
      } else if (/usage.limit|rate.limit|quota|hit your limit/i.test(errorText)) {
        resolve(failed("usage"));
      } else if (
        /unauthorized|log(?:ged)?[ -]?in|sign[ -]?in|token (?:has )?expired/i.test(errorText)
      ) {
        resolve(failed("sign-in"));
      } else {
        resolve(failed("codex"));
      }
    });
  });
}

export async function runJob(
  job: RunnerJob,
  checkout: string,
  worktrees: string,
  signal: AbortSignal,
): Promise<RunResult> {
  if (signal.aborted) return failed("expired");
  const repo = await checkoutRepository(checkout);
  const targetType = job.targetKind === "issue" ? "issues" : "pull";
  if (
    repo?.toLowerCase() !== job.repositoryName.toLowerCase() ||
    job.targetUrl.toLowerCase() !==
      `https://github.com/${job.repositoryName}/${targetType}/${job.targetNumber}`.toLowerCase()
  )
    return failed("checkout");

  let commit: string;
  try {
    commit = await git(checkout, "rev-parse", "HEAD^{commit}");
  } catch {
    return failed("checkout");
  }

  let skillName: string;
  try {
    const entry = await git(checkout, "ls-tree", commit, "--", job.skillPath);
    const sha = /^100(?:644|755) blob ([0-9a-f]{40})\t/.exec(entry)?.[1];
    if (sha !== job.skillSha) return failed("skill");
    const source = await git(checkout, "show", `${commit}:${job.skillPath}`);
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source)?.[1];
    const name =
      frontmatter && /^name:[ \t]*["']?([a-z0-9_-]+)["']?[ \t]*$/im.exec(frontmatter)?.[1];
    if (!name) return failed("skill");
    skillName = name;
  } catch {
    return failed("skill");
  }

  const worktree = join(worktrees, job.id);
  try {
    if (signal.aborted) return failed("expired");
    await mkdir(worktrees, { recursive: true, mode: 0o700 });
    await git(checkout, "worktree", "add", "-b", `codex/control-${job.id}`, worktree, commit);
  } catch {
    return failed("checkout");
  }
  try {
    if ((await git(worktree, "hash-object", "--no-filters", "--", job.skillPath)) !== job.skillSha)
      return failed("skill");
  } catch {
    return failed("skill");
  }
  return invokeCodex(codexArgs(job, worktree, skillName), worktree, signal);
}
