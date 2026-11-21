import { z } from "zod";

export type GitHubRaw = Record<string, unknown>;
export type GitHubUser = { id: number; login: string };
export type GitHubLabel = { id: number; name: string; color: string };
export type RecordKind = "issue" | "pull" | "run";
const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const user = z.object({ id, login: z.string() });
const label = z.object({ id, name: z.string(), color: z.string() });
const date = z.iso.datetime({ offset: true }).transform((value) => new Date(value));
const common = { id, html_url: z.url(), created_at: date, updated_at: date };
const issue = z.looseObject({
  ...common,
  number: id,
  title: z.string(),
  body: z.string().nullable(),
  state: z.enum(["open", "closed"]),
  state_reason: z.string().nullable().optional(),
  labels: z.array(label),
  user: user.nullable(),
  assignees: z.array(user),
  closed_at: date.nullable(),
});
const pull = issue.extend({
  draft: z.boolean().optional(),
  merged_at: date.nullable(),
  head: z.object({ ref: z.string() }),
  base: z.object({ ref: z.string() }),
});
const run = z.looseObject({
  ...common,
  run_number: id,
  run_attempt: id.optional(),
  workflow_id: id,
  name: z.string().nullable(),
  display_title: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  event: z.string(),
  head_branch: z.string().nullable(),
  head_sha: z.string(),
  run_started_at: date.nullable().optional(),
});
const credentialKeys = new Set([
  "token",
  "access_token",
  "refresh_token",
  "authorization",
  "secret",
  "password",
  "temp_clone_token",
]);

export function safeRaw(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safeRaw);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !credentialKeys.has(key.toLowerCase()))
        .map(([key, nested]) => [key, safeRaw(nested)]),
    );
  return value;
}

function raw(value: unknown): GitHubRaw {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid GitHub record.");
  return safeRaw(value) as GitHubRaw;
}

function parse<T>(schema: z.ZodType<T>, value: unknown, name: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(`GitHub returned an invalid ${name}.`);
  return result.data;
}

export function isPullIssue(value: unknown) {
  return Boolean(value && typeof value === "object" && "pull_request" in value);
}

export function normalizeIssue(value: unknown) {
  const data = parse(issue, value, "issue");
  return {
    githubId: data.id,
    number: data.number,
    title: data.title,
    description: data.body,
    state: data.state,
    stateReason: data.state_reason ?? null,
    labels: data.labels,
    author: data.user,
    assignees: data.assignees,
    url: data.html_url,
    githubCreatedAt: data.created_at,
    githubUpdatedAt: data.updated_at,
    closedAt: data.closed_at,
    raw: raw(value),
  };
}

export function normalizePull(value: unknown) {
  const data = parse(pull, value, "pull request");
  return {
    ...normalizeIssue(value),
    draft: data.draft ?? false,
    mergedAt: data.merged_at,
    headBranch: data.head.ref,
    baseBranch: data.base.ref,
  };
}

export function normalizeRun(value: unknown) {
  const data = parse(run, value, "workflow run");
  return {
    githubId: data.id,
    runNumber: data.run_number,
    runAttempt: data.run_attempt ?? 1,
    workflowId: data.workflow_id,
    workflow: data.name,
    title: data.display_title,
    status: data.status,
    conclusion: data.conclusion,
    event: data.event,
    branch: data.head_branch,
    commitSha: data.head_sha,
    startedAt: data.run_started_at ?? null,
    url: data.html_url,
    githubCreatedAt: data.created_at,
    githubUpdatedAt: data.updated_at,
    raw: raw(value),
  };
}
