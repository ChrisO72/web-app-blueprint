type System = {
  name: string;
  kind: "process" | "module" | "adapter" | "store" | "service";
  source: string;
  description: string;
};

const systems = {
  web: {
    name: "Web",
    kind: "process",
    source: "web/",
    description: "React Router UI, server routes, and the admin Control room.",
  },
  worker: {
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
    name: "PostgreSQL",
    kind: "store",
    source: "db/",
    description: "Users, sessions, organizations, items, and file metadata.",
  },
  redis: {
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
    source: "web/routes/control/",
    description: "Admin-only Control room within the Web application.",
  },
  controlDatabase: {
    name: "Control DB",
    kind: "store",
    source: "control/db/",
    description: "Separate PostgreSQL reserved for Control workflow data.",
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
  ],
} as const satisfies {
  name: string;
  systems: Record<SystemId, System>;
  connections: readonly (readonly [SystemId, SystemId])[];
};

export type SiteConfig = typeof site;
