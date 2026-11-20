import { z } from "zod";
import { recordFilterTextLimit } from "./pagination";

export const taskTargetKinds = ["issue", "pull"] as const;
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
