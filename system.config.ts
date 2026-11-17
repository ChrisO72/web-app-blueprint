type System = {
  name: string;
  kind: "process" | "module" | "adapter" | "store" | "service";
  source: string;
  description: string;
  renderResource?: string;
};

const systems = {
  web: {
    renderResource: "web-app-blueprint-web",
    name: "Web",
    kind: "process",
    source: "web/",
    description: "React Router UI, server routes, and the admin Control room.",
  },
  worker: {
    renderResource: "web-app-blueprint-worker",
    name: "Worker",
    kind: "process",
    source: "worker/",
    description: "Background jobs and scheduled tasks.",
  },
  repositories: {
    name: "Repositories",
    kind: "module",
    source: "db/repositories/",
    description: "Application data access for Web and Worker.",
  },
  database: {
    renderResource: "web-app-blueprint-db",
    name: "PostgreSQL",
    kind: "store",
    source: "db/",
    description: "Users, sessions, organizations, items, and file metadata.",
  },
  redis: {
    renderResource: "web-app-blueprint-queue",
    name: "Redis",
    kind: "store",
    source: "Redis",
    description: "Job queues and authentication rate limits.",
  },
  queue: {
    name: "BullMQ",
    kind: "adapter",
    source: "worker/queues.ts",
    description: "Web enqueues typed jobs for Worker to consume.",
  },
  storageAdapter: {
    name: "S3 adapter",
    kind: "adapter",
    source: "integrations/storage/",
    description: "Shared private object operations.",
  },
  storage: {
    renderResource: "web-app-blueprint-storage",
    name: "S3 storage",
    kind: "store",
    source: "SeaweedFS / S3",
    description: "Private file uploads and account avatars.",
  },
  mailAdapter: {
    name: "Mail adapter",
    kind: "adapter",
    source: "integrations/mail/",
    description: "Confirmation and password-reset email delivery.",
  },
  mail: {
    name: "Mail provider",
    kind: "service",
    source: "Lettermint",
    description: "External email delivery provider.",
  },
  control: {
    name: "Control",
    kind: "module",
    source: "control/",
    description: "Admin-only Control room, GitHub synchronization, and mirror data access.",
  },
  controlDatabase: {
    renderResource: "web-app-blueprint-control-db",
    name: "Control DB",
    kind: "store",
    source: "control/db/",
    description: "Separate PostgreSQL for the GitHub connection, issues, PRs, and workflow runs.",
  },
  sentryAdapter: {
    name: "Sentry adapter",
    kind: "adapter",
    source: "telemetry/ + control/sentry.server.ts",
    description:
      "Browser, Web, and Worker telemetry reporting and read-only logs and errors for Control.",
  },
  sentry: {
    name: "Sentry",
    kind: "service",
    source: "sentry.io",
    description: "Hosted errors, logs, traces, metrics, and browser session replays.",
  },
  githubAdapter: {
    name: "GitHub API",
    kind: "adapter",
    source: "integrations/github/",
    description:
      "Repository metadata, webhook registration, and synchronization through the shared worker.",
  },
  github: {
    name: "GitHub",
    kind: "service",
    source: "github.com",
    description: "Source of truth for connected repository issues, PRs, and Actions runs.",
  },
} as const satisfies Record<string, System>;

export type SystemId = keyof typeof systems;

export const site = {
  name: "Fullstack Blueprint",
  systems,
  connections: [
    ["web", "repositories"],
    ["worker", "repositories"],
    ["repositories", "database"],
    ["web", "queue"],
    ["queue", "redis"],
    ["queue", "worker"],
    ["web", "storageAdapter"],
    ["worker", "storageAdapter"],
    ["storageAdapter", "storage"],
    ["worker", "mailAdapter"],
    ["mailAdapter", "mail"],
    ["web", "control"],
    ["control", "controlDatabase"],
    ["worker", "control"],
    ["web", "sentryAdapter"],
    ["worker", "sentryAdapter"],
    ["control", "sentryAdapter"],
    ["sentryAdapter", "sentry"],
    ["control", "githubAdapter"],
    ["githubAdapter", "github"],
    ["github", "web"],
  ],
} as const satisfies {
  name: string;
  systems: Record<SystemId, System>;
  connections: readonly (readonly [SystemId, SystemId])[];
};

export type SiteConfig = typeof site;
