import { z } from "zod";
import { repositorySkillPath, taskEfforts, taskModels, taskTargetKinds } from "./tasks";

export const runnerPollMs = 15_000;
export const runnerProgressMs = 2_000;
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

export const codexOutputLimits = { entries: 80, entryLength: 4000, textLength: 24_000 };
export const codexThreadIdSchema = z.uuid();
export const codexOutputIdSchema = z.string().regex(/^[\w.-]{1,128}$/);
export const codexProgressSchema = z
  .object({
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    threadId: codexThreadIdSchema.optional(),
    entries: z
      .array(
        z.object({
          id: codexOutputIdSchema,
          kind: z.enum(["message", "tool"]),
          text: z
            .string()
            .min(1)
            .max(codexOutputLimits.entryLength)
            .refine((text) => !text.includes("\0")),
        }),
      )
      .max(codexOutputLimits.entries),
    truncated: z.boolean(),
  })
  .refine(
    ({ entries }) =>
      entries.reduce((length, entry) => length + entry.text.length, 0) <=
      codexOutputLimits.textLength,
  );
export type CodexProgress = z.infer<typeof codexProgressSchema>;

const repositoryName = z
  .string()
  .max(140)
  .regex(/^[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+$/);
const poll = z
  .object({
    action: z.literal("poll"),
    instanceId: z.uuid(),
    repositoryName: repositoryName.nullable(),
    readiness: z.enum(runnerReadiness),
    leaseId: z.uuid().optional(),
    progress: codexProgressSchema.optional(),
  })
  .refine(({ leaseId, progress }) => !progress || Boolean(leaseId));
const finish = z.object({
  action: z.literal("finish"),
  instanceId: z.uuid(),
  taskId: z.uuid(),
  leaseId: z.uuid(),
  progress: codexProgressSchema.optional(),
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
