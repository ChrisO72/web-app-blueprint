import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import type { User } from "~/db/repositories/users";
import { env } from "~/web/env.server";
import { authenticatedUserContext } from "~/web/lib/session.server";
import { loader as overviewLoader } from "~/web/routes/control/index";
import {
  action as createTaskAction,
  loader as activityLoader,
} from "~/web/routes/control/activity";
import { loader as activityOptionsLoader } from "~/web/routes/control/activity-options";
import { action as settingsAction, loader as settingsLoader } from "~/web/routes/control/settings";
import { action as docsAction, loader as docsLoader } from "~/web/routes/control/docs";
import { loadDocuments, loadRepositorySkills, proposeDocument } from "~/control/docs.server";
import { loader as issuesLoader } from "~/web/routes/control/issues";
import { loader as prsLoader } from "~/web/routes/control/prs";
import { loader as recordLoader } from "~/web/routes/control/record";
import { loader as actionsLoader } from "~/web/routes/control/actions";
import {
  saveToken,
  connectRepository,
  requestSync,
  replaceToken,
  disconnect,
  publicError,
} from "~/control/github.server";
import { getRecordDetails, listRecords } from "~/control/db/repositories/github.server";
import {
  createTask,
  findTaskSubmission,
  listTasks,
  listTaskTargets,
} from "~/control/db/repositories/tasks.server";
import { CONNECTION_ID, TOKEN } from "~/integrations/github/test/fixtures";
import type { Route } from "../routes/control/+types/index";

vi.mock("~/control/docs.server", () => ({
  loadDocuments: vi.fn(),
  loadRepositorySkills: vi.fn(),
  proposeDocument: vi.fn(),
}));
vi.mock("~/control/db/repositories/tasks.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/control/db/repositories/tasks.server")>()),
  listTasks: vi.fn(async () => ({
    tasks: [],
    page: 1,
    pageSize: 10,
    totalPages: 0,
    totalCount: 0,
  })),
  listTaskTargets: vi.fn(async () => null),
  findTaskSubmission: vi.fn(async () => null),
  createTask: vi.fn(async () => ({ outcome: "created" as const })),
}));
vi.mock("~/control/github.server", () => ({
  settingsData: vi.fn(async () => ({
    setup: { ready: false, error: null },
    connection: null,
    repositories: [],
    error: null,
  })),
  saveToken: vi.fn(),
  connectRepository: vi.fn(),
  requestSync: vi.fn(),
  replaceToken: vi.fn(),
  disconnect: vi.fn(),
  publicError: vi.fn(),
}));
vi.mock("~/control/db/repositories/github.server", () => ({
  getRecordDetails: vi.fn(async () => null),
  listRecords: vi.fn(async () => ({
    connection: null,
    records: [],
    page: 1,
    totalPages: 0,
    totalCount: 0,
    pageSize: 10,
    query: { page: 1, pageSize: 10, q: "", status: "", scope: "" },
  })),
}));

function args(role: User["role"], path: string) {
  const context = new RouterContextProvider();
  const now = new Date();
  context.set(authenticatedUserContext, {
    id: 1,
    organizationId: 1,
    email: "user@example.com",
    firstName: "User",
    lastName: null,
    avatarFileId: null,
    emailConfirmedAt: now,
    role,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  return {
    request: new Request(`http://localhost:5173${path}`),
    url: new URL(`http://localhost:5173${path}`),
    pattern: path,
    params: {},
    context,
  } satisfies Route.LoaderArgs;
}

describe.each([
  { path: "/control", loader: overviewLoader },
  { path: "/control/activity", loader: activityLoader },
  { path: "/control/activity/options", loader: activityOptionsLoader },
  { path: "/control/settings", loader: settingsLoader },
  { path: "/control/docs", loader: docsLoader },
  { path: "/control/issues", loader: issuesLoader },
  { path: "/control/prs", loader: prsLoader },
  { path: "/control/actions", loader: actionsLoader },
  { path: "/control/record?kind=issue&githubId=123", loader: recordLoader },
])("Control access ($path)", ({ path, loader }) => {
  it("allows the existing application admin", async () => {
    expect(await loader(args("admin", path))).not.toBeUndefined();
  });

  it.each(["user", "viewer"] as const)(
    "redirects a %s requesting Control directly",
    async (role) => {
      await expect(
        (async () => {
          await loader(args(role, path));
        })(),
      ).rejects.toMatchObject({
        status: 302,
      });
    },
  );
});

it("provides schema-derived entity fields in the Control overview", () => {
  const { moduleTypes } = overviewLoader(args("admin", "/control"));
  const users = moduleTypes.repositories?.find(({ name }) => name === "users");
  expect(users?.source).toBe("db/schema/auth.ts");
  const userFields = users && "fields" in users ? users.fields : [];
  expect(userFields.find(({ name }) => name === "role")).toMatchObject({
    sqlType: "varchar",
    nullable: false,
    enumValues: ["admin", "user", "viewer"],
  });
  expect(userFields.find(({ name }) => name === "avatarFileId")).toMatchObject({
    sqlType: "integer",
    nullable: true,
  });
  const pulls = moduleTypes.control?.find(({ name }) => name === "github_pulls");
  const pullFields = pulls && "fields" in pulls ? pulls.fields : [];
  expect(pullFields.find(({ name }) => name === "headBranch")).toMatchObject({
    sqlType: "text",
    nullable: false,
  });
});

describe("Control activity", () => {
  const selection = {
    id: "7e0547a5-3f88-41c0-ae4e-b6f70efca686",
    connectionId: CONNECTION_ID,
    targetKind: "issue",
    targetId: "42",
    skillPath: ".agents/skills/blueprint-build/SKILL.md",
  };
  const skillSha = "a".repeat(40);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadRepositorySkills).mockResolvedValue({
      connectionId: CONNECTION_ID,
      repositoryId: 123,
      skills: [{ name: "blueprint-build", path: selection.skillPath, sha: skillSha }],
    });
  });

  function submission(role: User["role"], origin = env.APP_URL) {
    const base = args(role, "/control/activity");
    return {
      ...base,
      request: new Request(base.url, {
        method: "POST",
        headers: { origin },
        body: new URLSearchParams({ ...selection, organizationId: "9", skillSha: "untrusted" }),
      }),
    };
  }

  it("scopes history to the authenticated organization and uses Control pagination", async () => {
    await activityLoader(args("admin", "/control/activity?page=3&pageSize=25&organizationId=9"));
    expect(listTasks).toHaveBeenCalledExactlyOnceWith(1, 3, 25);
  });

  it("searches synced targets by the trimmed query", async () => {
    await activityOptionsLoader(args("admin", "/control/activity/options?q=+%2342+"));
    expect(listTaskTargets).toHaveBeenCalledExactlyOnceWith("#42");
  });

  it("blocks non-admins from loading skills or creating tasks", async () => {
    await expect(
      activityOptionsLoader(args("viewer", "/control/activity/options?kind=skills")),
    ).rejects.toMatchObject({ status: 302 });
    await expect(createTaskAction(submission("user"))).rejects.toMatchObject({ status: 302 });
    expect(loadRepositorySkills).not.toHaveBeenCalled();
    expect(findTaskSubmission).not.toHaveBeenCalled();
    expect(createTask).not.toHaveBeenCalled();
  });

  it("guards task creation by method and origin", async () => {
    await expect(createTaskAction(args("admin", "/control/activity"))).rejects.toMatchObject({
      status: 405,
    });
    await expect(
      createTaskAction(submission("admin", "https://other.example")),
    ).rejects.toMatchObject({ status: 403 });
    expect(findTaskSubmission).not.toHaveBeenCalled();
  });

  it("uses the authenticated owner and the server-resolved skill when creating a task", async () => {
    expect(await createTaskAction(submission("admin"))).toEqual({ success: true });
    expect(loadRepositorySkills).toHaveBeenCalledExactlyOnceWith(CONNECTION_ID);
    expect(createTask).toHaveBeenCalledExactlyOnceWith({
      ...selection,
      targetId: 42,
      organizationId: 1,
      createdByUserId: 1,
      repositoryId: 123,
      skillSha,
    });
  });

  it("rejects a skill that disappeared after the picker loaded", async () => {
    vi.mocked(loadRepositorySkills).mockResolvedValueOnce({
      connectionId: CONNECTION_ID,
      repositoryId: 123,
      skills: [],
    });
    expect(await createTaskAction(submission("admin"))).toMatchObject({
      fieldErrors: { skillPath: expect.any(Array) },
    });
    expect(createTask).not.toHaveBeenCalled();
  });

  it("returns success for a saved submission even after the repository disconnects", async () => {
    vi.mocked(findTaskSubmission).mockResolvedValueOnce({
      ...selection,
      targetKind: "issue",
      targetId: 42,
      organizationId: 1,
      createdByUserId: 1,
      createdAt: new Date(),
      status: "created",
      repositoryId: 123,
      repositoryName: "owner/repo",
      targetNumber: 15,
      targetTitle: "Example",
      targetUrl: "https://github.com/owner/repo/issues/15",
      skillSha,
    });
    expect(await createTaskAction(submission("admin"))).toEqual({ success: true });
    expect(loadRepositorySkills).not.toHaveBeenCalled();
    expect(createTask).not.toHaveBeenCalled();
  });
});

describe.each([
  { path: "/control/issues", loader: issuesLoader, kind: "issue", status: "open" },
  { path: "/control/prs", loader: prsLoader, kind: "pull", status: "merged" },
  { path: "/control/actions", loader: actionsLoader, kind: "run", status: "failure" },
])("Control records ($path)", ({ path, loader, kind, status }) => {
  it.each([
    { query: "", page: 1, pageSize: 10 },
    { query: "?page=3&pageSize=5", page: 3, pageSize: 5 },
    { query: "?page=2&pageSize=25", page: 2, pageSize: 25 },
    { query: "?page=2&pageSize=50", page: 2, pageSize: 50 },
    { query: "?page=-1&pageSize=0", page: 1, pageSize: 10 },
    { query: "?page=1.5&pageSize=12", page: 1, pageSize: 10 },
    { query: "?page=1000001&pageSize=1000000", page: 1, pageSize: 10 },
    { query: "?page=invalid&pageSize=invalid", page: 1, pageSize: 10 },
    { query: "?q=%00&scope=%20&status=invalid", page: 1, pageSize: 10 },
  ])("validates $query before querying records", async ({ query, page, pageSize }) => {
    vi.mocked(listRecords).mockClear();
    await loader(args("admin", `${path}${query}`));
    expect(listRecords).toHaveBeenCalledExactlyOnceWith(kind, {
      page,
      pageSize,
      q: "",
      status: "",
      scope: "",
    });
  });

  it("passes trimmed filters and pagination to the repository", async () => {
    vi.mocked(listRecords).mockClear();
    await loader(
      args("admin", `${path}?page=2&pageSize=5&q=+%2342+&scope=+release+&status=${status}`),
    );
    expect(listRecords).toHaveBeenCalledExactlyOnceWith(kind, {
      page: 2,
      pageSize: 5,
      q: "#42",
      status,
      scope: "release",
    });
  });
});

describe("Control settings actions", () => {
  const initialAppUrl = env.APP_URL;
  afterEach(() => {
    env.APP_URL = initialAppUrl;
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(publicError).mockReturnValue("GitHub could not complete this operation.");
  });
  function actionArgs(
    role: User["role"],
    values: Record<string, string>,
    origin = "http://localhost:5173",
    requestUrl = "http://localhost:5173/control/settings",
  ) {
    return {
      ...args(role, "/control/settings"),
      url: new URL(requestUrl),
      request: new Request(requestUrl, {
        method: "POST",
        headers: { origin },
        body: new URLSearchParams(values),
      }),
    };
  }
  it.each(["user", "viewer"] as const)(
    "blocks %s before processing any credentials",
    async (role) => {
      await expect(
        settingsAction(actionArgs(role, { intent: "validate", token: TOKEN })),
      ).rejects.toMatchObject({ status: 302 });
      expect(saveToken).not.toHaveBeenCalled();
    },
  );
  it("rejects cross-origin settings submissions", async () => {
    await expect(
      settingsAction(
        actionArgs("admin", { intent: "validate", token: TOKEN }, "https://other.example"),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(saveToken).not.toHaveBeenCalled();
  });
  it("accepts the public HTTPS origin when the reverse proxy forwards over HTTP", async () => {
    env.APP_URL = "https://web-app-blueprint-web.onrender.com";
    const result = await settingsAction(
      actionArgs(
        "admin",
        { intent: "validate", token: TOKEN },
        env.APP_URL,
        "http://web-app-blueprint-web.onrender.com/control/settings",
      ),
    );
    expect(result).toEqual({ success: true });
    expect(saveToken).toHaveBeenCalledWith(TOKEN);
  });
  it("rejects an internal origin even if it matches the forwarded request URL", async () => {
    env.APP_URL = "https://web-app-blueprint-web.onrender.com";
    await expect(
      settingsAction(
        actionArgs(
          "admin",
          { intent: "validate", token: TOKEN },
          "http://web-app-blueprint-web.onrender.com",
          "http://web-app-blueprint-web.onrender.com/control/settings",
        ),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(saveToken).not.toHaveBeenCalled();
  });
  it("validates input without echoing the submitted token", async () => {
    const result = await settingsAction(
      actionArgs("admin", { intent: "replace", connectionId: "invalid", token: TOKEN }),
    );
    expect(result.fieldErrors).toHaveProperty("connectionId");
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(replaceToken).not.toHaveBeenCalled();
  });
  it("allows admins to validate and manage the repository", async () => {
    const submissions: Record<string, string>[] = [
      { intent: "validate", token: TOKEN },
      { intent: "connect", connectionId: CONNECTION_ID, repositoryId: "123" },
      { intent: "replace", connectionId: CONNECTION_ID, token: TOKEN },
      { intent: "sync", connectionId: CONNECTION_ID },
      { intent: "disconnect", connectionId: CONNECTION_ID },
    ];
    for (const values of submissions) {
      const result = await settingsAction(actionArgs("admin", values));
      expect(result).toEqual({ success: true });
      expect(JSON.stringify(result)).not.toContain(TOKEN);
    }
    expect(saveToken).toHaveBeenCalledWith(TOKEN);
    expect(connectRepository).toHaveBeenCalledWith(CONNECTION_ID, 123);
    expect(replaceToken).toHaveBeenCalledWith(CONNECTION_ID, TOKEN);
    expect(requestSync).toHaveBeenCalledWith(CONNECTION_ID);
    expect(disconnect).toHaveBeenCalledWith(CONNECTION_ID);
  });
  it("returns only a safe error after a failed credential operation", async () => {
    vi.mocked(saveToken).mockRejectedValueOnce(new Error(TOKEN));
    const result = await settingsAction(actionArgs("admin", { intent: "validate", token: TOKEN }));
    expect(result.formError).toBe("GitHub could not complete this operation.");
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });
});

describe("Control record details", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["issue", "pull", "run"] as const)(
    "loads a %s only after admin authorization",
    async (kind) => {
      await recordLoader(args("admin", `/control/record?kind=${kind}&githubId=123`));
      expect(getRecordDetails).toHaveBeenCalledExactlyOnceWith(kind, 123);
    },
  );

  it.each(["user", "viewer"] as const)("blocks %s before reading details", async (role) => {
    await expect(
      recordLoader(args(role, "/control/record?kind=issue&githubId=123")),
    ).rejects.toMatchObject({ status: 302 });
    expect(getRecordDetails).not.toHaveBeenCalled();
  });

  it.each([
    "",
    "?kind=unknown&githubId=123",
    "?kind=issue&githubId=-1",
    "?kind=pull&githubId=1.5",
    "?kind=run&githubId=9007199254740992",
  ])("rejects invalid query %s", async (query) => {
    const result = await recordLoader(args("admin", `/control/record${query}`));
    expect(result.record).toBeNull();
    expect(result.message).toBe("Invalid record.");
    expect(getRecordDetails).not.toHaveBeenCalled();
  });

  it("reports a record removed from the mirror", async () => {
    const result = await recordLoader(args("admin", "/control/record?kind=issue&githubId=123"));
    expect(result).toEqual({
      key: "issue:123",
      record: null,
      message: "This record is no longer available.",
    });
  });
});

describe("Docs proposals", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each(["user", "viewer"] as const)(
    "blocks %s before reading or proposing changes",
    async (role) => {
      await expect(docsLoader(args(role, "/control/docs"))).rejects.toMatchObject({ status: 302 });
      await expect(docsAction(args(role, "/control/docs"))).rejects.toMatchObject({ status: 302 });
      expect(loadDocuments).not.toHaveBeenCalled();
      expect(proposeDocument).not.toHaveBeenCalled();
    },
  );
  it("rejects cross-origin proposals", async () => {
    const input = args("admin", "/control/docs");
    const request = new Request(input.url, {
      method: "POST",
      headers: { origin: "https://other.example" },
    });
    await expect(docsAction({ ...input, request })).rejects.toMatchObject({ status: 403 });
    expect(proposeDocument).not.toHaveBeenCalled();
  });
});
