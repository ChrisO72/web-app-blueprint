import { z } from "zod";
import { repositorySkillPath, taskEfforts, taskModels, taskTargetKinds } from "./tasks";

export const runnerPollMs = 15_000;
export const runnerLeaseMs = 45_000;
export const runnerSecretSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const runnerReadiness = ["ready", "sign-in", "checkout"] as const;
export const taskFailureReasons = [
  "expired",
  "sign-in",
  "checkout",
  "skill",
  "usage",
  "codex",
] as const;
export const taskFailureLabels = {
  expired: "The Mac stopped checking in before this task finished.",
  "sign-in": "Sign in to Codex on the Mac with your ChatGPT account.",
  checkout: "Check the runner's local GitHub checkout and worktree permissions.",
  skill: "The saved skill version is unavailable in the runner's checkout.",
  usage: "Codex reached your ChatGPT usage limit.",
  codex: "Codex failed. See the runner terminal for the task ID and error category.",
} satisfies Record<(typeof taskFailureReasons)[number], string>;

const repositoryName = z
  .string()
  .max(140)
  .regex(/^[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+$/);
const poll = z.object({
  action: z.literal("poll"),
  instanceId: z.uuid(),
  repositoryName: repositoryName.nullable(),
  readiness: z.enum(runnerReadiness),
  leaseId: z.uuid().optional(),
});
const finish = z.object({
  action: z.literal("finish"),
  instanceId: z.uuid(),
  taskId: z.uuid(),
  leaseId: z.uuid(),
  result: z.discriminatedUnion("status", [
    z.object({ status: z.literal("done") }),
    z.object({ status: z.literal("failed"), reason: z.enum(taskFailureReasons) }),
  ]),
});
export const runnerRequest = z.discriminatedUnion("action", [poll, finish]);
export type RunnerPoll = z.infer<typeof poll>;
export type RunnerFinish = z.infer<typeof finish>;

export const runnerJobSchema = z.object({
  id: z.uuid(),
  leaseId: z.uuid(),
  repositoryName,
  targetKind: z.enum(taskTargetKinds),
  targetNumber: z.number().int().positive(),
  targetUrl: z.url(),
  skillPath: z.string().max(1024).regex(repositorySkillPath),
  skillSha: z.string().regex(/^[0-9a-f]{40}$/),
  model: z.enum(taskModels),
  effort: z.enum(taskEfforts),
});
export type RunnerJob = z.infer<typeof runnerJobSchema>;
