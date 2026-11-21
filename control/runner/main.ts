import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { z } from "zod";
import {
  runnerJobSchema,
  runnerLeaseMs,
  runnerPollMs,
  runnerProgressMs,
  type RunnerFinish,
  type RunnerJob,
  type RunnerPoll,
} from "../runner-protocol";
import { checkoutRepository, runJob, signedIntoChatGpt, type RunResult } from "./codex";
import { runnerConfigSchema } from "./config";
import { createCodexProgress } from "./progress";

const pollResponse = z.object({ job: runnerJobSchema.nullable() });
type ActiveJob = {
  job: RunnerJob;
  controller: AbortController;
  timer?: ReturnType<typeof setTimeout>;
  completion: Promise<RunResult>;
  result?: RunResult;
  progress: ReturnType<typeof createCodexProgress>;
  sentRevision: number;
};

function renewLocally(active: ActiveJob, sentAt: number) {
  clearTimeout(active.timer);
  // Budget from before the request, so network latency never extends a local lease.
  const leaseLeft = runnerLeaseMs - Math.max(0, Date.now() - sentAt) - 1000;
  if (leaseLeft <= 0) active.controller.abort();
  else active.timer = setTimeout(() => active.controller.abort(), leaseLeft);
}

async function main() {
  const configFile = process.argv[2];
  if (configFile) process.loadEnvFile(configFile);
  const parsed = runnerConfigSchema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map(({ path }) => path.join("."));
    throw new Error("Invalid runner configuration: " + fields.join(", "));
  }
  const config = parsed.data;
  const url = new URL("/control/runner", config.CONTROL_RUNNER_URL);
  const worktrees = join(homedir(), ".codex-control", "worktrees");
  const instanceId = randomUUID();
  const shutdown = new AbortController();
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => shutdown.abort());
  }
  let active: ActiveJob | undefined;
  let previousNotice: string | undefined;
  let nextHeartbeat = 0;

  async function post(input: RunnerPoll | RunnerFinish) {
    const response = await fetch(url, {
      method: "POST",
      redirect: "error",
      headers: {
        authorization: "Bearer " + config.CONTROL_RUNNER_SECRET,
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
      signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(5000)]),
    });
    if (!response.ok && response.status !== 409) {
      throw new Error(
        response.status === 401
          ? "Control rejected the runner credentials."
          : "Control is unavailable.",
      );
    }
    return response;
  }

  async function release() {
    if (!active) return;
    clearTimeout(active.timer);
    active.controller.abort();
    await active.completion;
    active = undefined;
  }

  process.stdout.write("Control runner started. Press Ctrl+C to stop.\n");
  try {
    while (!shutdown.signal.aborted) {
      const cycleStarted = performance.now();
      try {
        if (active?.result) {
          const response = await post({
            action: "finish",
            instanceId,
            taskId: active.job.id,
            leaseId: active.job.leaseId,
            result: active.result,
            progress: active.progress.snapshot,
          });
          if (response.status === 409)
            process.stderr.write(`Task ${active.job.id} lost its lease.\n`);
          await release();
        }

        const snapshot = active?.progress.snapshot;
        const progress =
          snapshot && snapshot.revision > (active?.sentRevision ?? 0) ? snapshot : undefined;
        if (!active || progress || cycleStarted >= nextHeartbeat) {
          const repositoryName =
            active?.job.repositoryName ??
            (await checkoutRepository(config.CONTROL_RUNNER_CHECKOUT));
          const readiness = !repositoryName
            ? "checkout"
            : active || (await signedIntoChatGpt())
              ? "ready"
              : "sign-in";
          const sentAt = Date.now();
          const response = await post({
            action: "poll",
            instanceId,
            repositoryName,
            readiness,
            leaseId: active?.job.leaseId,
            progress,
          });
          if (response.status === 409) {
            await release();
          } else {
            const { job } = pollResponse.parse(await response.json());
            nextHeartbeat = performance.now() + runnerPollMs;
            if (active) {
              if (!job || active.job.leaseId !== job.leaseId) await release();
              else {
                renewLocally(active, sentAt);
                if (progress) active.sentRevision = progress.revision;
              }
            } else if (job && !shutdown.signal.aborted) {
              const controller = new AbortController();
              const output = createCodexProgress(process.env);
              const completion = runJob(
                job,
                config.CONTROL_RUNNER_CHECKOUT,
                worktrees,
                controller.signal,
                output.record,
              ).catch((): RunResult => ({ status: "failed", reason: "codex" }));
              const run: ActiveJob = {
                job,
                controller,
                completion,
                progress: output,
                sentRevision: 0,
              };
              active = run;
              renewLocally(run, sentAt);
              process.stdout.write(`Task ${job.id} running.\n`);
              void completion.then((result) => {
                run.result = result;
                process.stdout.write(
                  `Task ${job.id} ${result.status}${result.status === "failed" ? ` (${result.reason})` : ""}.\n`,
                );
              });
            }
          }
          previousNotice = undefined;
        }
      } catch (error) {
        if (shutdown.signal.aborted) break;
        const notice =
          error instanceof Error && error.message === "Control rejected the runner credentials."
            ? error.message
            : "Could not check in with Control. Retrying.";
        if (notice !== previousNotice) process.stderr.write(notice + "\n");
        previousNotice = notice;
      }
      await wait(
        Math.max(
          0,
          (active ? runnerProgressMs : runnerPollMs) - (performance.now() - cycleStarted),
        ),
        null,
        {
          signal: shutdown.signal,
        },
      ).catch(() => undefined);
    }
  } finally {
    await release();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error && error.message.startsWith("Invalid runner configuration:")
      ? error.message
      : "Could not start the Control runner. Check its config file and URL.";
  process.stderr.write(message + "\n");
  process.exitCode = 1;
});
