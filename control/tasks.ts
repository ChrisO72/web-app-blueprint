import { z } from "zod";
import { recordFilterTextLimit } from "./pagination";

export const taskTargetKinds = ["issue", "pull"] as const;
export const taskStatuses = ["created", "queued", "running", "done", "failed"] as const;
export const taskModels = ["gpt-6.2-sol", "gpt-6.2-astra"] as const;
export const taskEfforts = ["low", "medium", "high", "xhigh", "max"] as const;
export const defaultTaskModel = taskModels[0];
export const defaultTaskEffort = taskEfforts[1];
export const taskModelLabels = {
  "gpt-6.2-sol": "GPT-6.2 Sol",
  "gpt-6.2-astra": "GPT-6.2 Astra",
} satisfies Record<(typeof taskModels)[number], string>;
export const taskEffortLabels = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  max: "Max",
} satisfies Record<(typeof taskEfforts)[number], string>;
export const repositorySkillPath = /^\.agents\/skills\/[^/\0]+\/SKILL\.md$/;

export const taskTargetSearch = z
  .string()
  .trim()
  .refine((value) => !value.includes("\0"))
  .transform((value) => value.slice(0, recordFilterTextLimit))
  .catch("");

export type TaskTarget = {
  kind: (typeof taskTargetKinds)[number];
  githubId: number;
  title: string;
  number: number;
};

export type TaskSkill = { name: string; path: string; sha: string };
