import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import type { SiteConfig, SystemId } from "~/system.config";

type ModuleId = {
  [Id in SystemId]: SiteConfig["systems"][Id]["kind"] extends "module" ? Id : never;
}[SystemId];

export type ModuleType = {
  name: string;
  source: string;
  definition: string;
};

function databaseTypes(schemas: Record<string, Record<string, unknown>>): ModuleType[] {
  return Object.entries(schemas)
    .flatMap(([path, schema]) =>
      Object.values(schema)
        .filter((value) => is(value, PgTable))
        .map((table) => ({
          name: getTableName(table),
          source: path.slice(1),
          definition: Object.entries(getTableColumns(table))
            .map(([property, column]) => {
              const values = column.enumValues?.map((value: string) => JSON.stringify(value));
              const type = values?.length ? values.join(" | ") : column.getSQLType();
              return `${property}: ${type}${column.notNull ? "" : " | null"}`;
            })
            .join("\n"),
        })),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const moduleTypes: Partial<Record<SystemId, readonly ModuleType[]>> = {
  repositories: databaseTypes(
    import.meta.glob<Record<string, unknown>>("/db/schema/*.ts", { eager: true }),
  ),
  control: databaseTypes(
    import.meta.glob<Record<string, unknown>>("/control/db/schema/*.ts", { eager: true }),
  ),
  queue: [
    {
      name: "JobData",
      source: "worker/jobs/dispatcher.ts",
      definition: `type JobData = {
  syncGithub: GitHubSyncJobData;
  expirePendingFileUpload: { organizationId: number; fileId: number };
  sendConfirmationEmail: { to: string; token: string; expiresInHours: number };
  sendPasswordResetEmail: { to: string; token: string; expiresInHours: number };
};`,
    },
    {
      name: "GitHubSyncJobData",
      source: "worker/jobs/sync-github.ts",
      definition: `type GitHubSyncJobData =
  | { kind: "full"; connectionId: string; syncId: string }
  | {
      kind: "record";
      connectionId: string;
      recordKind: "issue" | "pull" | "run";
      githubId: number;
      number: number;
      deleted: boolean;
    };`,
    },
  ],
  storageModule: [
    {
      name: "Presigned upload",
      source: "integrations/storage/objects.server.ts",
      definition: `function createFileUpload(
  storageKey: string,
  contentType: string,
  expectedSize: number,
): Promise<{ url: string; fields: Record<string, string> }>;`,
    },
    {
      name: "Stored object metadata",
      source: "integrations/storage/objects.server.ts",
      definition: `function inspectStoredFile(storageKey: string): Promise<{
  contentType: string | undefined;
  size: number | undefined;
}>;`,
    },
    {
      name: "Download, preview, and delete",
      source: "integrations/storage/objects.server.ts",
      definition: `function createFileDownloadUrl(storageKey: string, filename: string): Promise<string>;
function createFilePreviewUrl(storageKey: string, contentType: string): Promise<string>;
function deleteStoredFile(storageKey: string): Promise<void>;`,
    },
  ],
  mailModule: [
    {
      name: "Email sent to Lettermint",
      source: "integrations/mail/client.server.ts",
      definition: `type LettermintMessage = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
};`,
    },
    {
      name: "Confirmation and reset inputs",
      source:
        "integrations/mail/confirmation.server.ts + integrations/mail/password-reset.server.ts",
      definition: `type ConfirmationEmail = {
  to: string;
  token: string;
  expiresInHours: number;
};
type PasswordResetEmail = ConfirmationEmail;`,
    },
  ],
  sentryModule: [
    {
      name: "Log data sent to Sentry",
      source: "telemetry/log.server.ts",
      definition: `type Attributes = Record<string, string | number | boolean>;

function emit(
  level: "info" | "warn" | "error",
  message: string,
  attributes?: Attributes,
): void;`,
    },
    {
      name: "TelemetryLog",
      source: "control/telemetry.ts",
      definition: `type TelemetryLog = {
  id: string;
  timestamp: string;
  severity: string;
  service: string;
  message: string;
  context: { label: string; value: string }[];
};`,
    },
    {
      name: "TelemetryIssue",
      source: "control/telemetry.ts",
      definition: `type TelemetryIssue = {
  id: string;
  title: string;
  status: string;
  count?: string;
  firstSeen?: string;
  lastSeen?: string;
  culprit?: string;
  url?: string;
};`,
    },
    {
      name: "TelemetryResult",
      source: "control/telemetry.ts",
      definition: `type TelemetryResult = {
  state: "ready" | "empty" | "unconfigured" | "error";
  environments: string[];
  logs: TelemetryLog[];
  issues: TelemetryIssue[];
  previous?: string;
  next?: string;
  message?: string;
};`,
    },
  ],
  githubModule: [
    {
      name: "GitHubRepository",
      source: "integrations/github/client.server.ts",
      definition: `type GitHubRepository = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  owner: { login: string };
};`,
    },
    {
      name: "GitHubHook",
      source: "integrations/github/client.server.ts",
      definition: `type GitHubHook = { id: number; config: { url?: string } };

type WebhookRequest = {
  name: "web";
  active: true;
  events: ["issues", "pull_request", "workflow_run"];
  config: {
    url: string;
    content_type: "json";
    insecure_ssl: "0";
    secret: string;
  };
};`,
    },
    {
      name: "Record pages",
      source: "integrations/github/client.server.ts + integrations/github/records.ts",
      definition: `type GitHubPage = { items: unknown[]; next: string | null };

type RecordKind = "issue" | "pull" | "run";
type GitHubUser = { id: number; login: string };
type GitHubLabel = { id: number; name: string; color: string };
type GitHubRaw = Record<string, unknown>;`,
    },
    {
      name: "Issue and pull request responses",
      source: "integrations/github/records.ts",
      definition: `type IssueResponse = {
  id: number;
  html_url: string;
  created_at: string;
  updated_at: string;
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  state_reason?: string | null;
  labels: GitHubLabel[];
  user: GitHubUser | null;
  assignees: GitHubUser[];
  closed_at: string | null;
};

type PullResponse = IssueResponse & {
  draft?: boolean;
  merged_at: string | null;
  head: { ref: string };
  base: { ref: string };
};`,
    },
    {
      name: "Workflow run response",
      source: "integrations/github/records.ts",
      definition: `type WorkflowRunResponse = {
  id: number;
  html_url: string;
  created_at: string;
  updated_at: string;
  run_number: number;
  run_attempt?: number;
  workflow_id: number;
  name: string | null;
  display_title: string;
  status: string;
  conclusion: string | null;
  event: string;
  head_branch: string | null;
  head_sha: string;
  run_started_at?: string | null;
};`,
    },
    {
      name: "Repository documents",
      source: "integrations/github/docs.server.ts",
      definition: `type RepositorySnapshot = {
  branch: string;
  head: string;
  tree: string;
  url: string;
  id: number;
};
type DocumentEntry = { path: string; sha: string; mode: string };`,
    },
  ],
} satisfies Record<ModuleId, readonly ModuleType[]>;
