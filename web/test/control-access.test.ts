import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import type { User } from "~/db/repositories/users";
import { env } from "~/web/env.server";
import { authenticatedUserContext } from "~/web/lib/session.server";
import { loader as overviewLoader } from "~/web/routes/control/index";
import { loader as activityLoader } from "~/web/routes/control/activity";
import { action as settingsAction, loader as settingsLoader } from "~/web/routes/control/settings";
import { loader as issuesLoader } from "~/web/routes/control/issues";
import { loader as prsLoader } from "~/web/routes/control/prs";
import { loader as actionsLoader } from "~/web/routes/control/actions";
import {
  saveToken,
  connectRepository,
  requestSync,
  replaceToken,
  disconnect,
  publicError,
} from "~/control/github.server";
import { listRecords } from "~/control/db/repositories/github.server";
import { CONNECTION_ID, TOKEN } from "~/integrations/github/test/fixtures";
import type { Route } from "../routes/control/+types/index";

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
  listRecords: vi.fn(async () => ({
    connection: null,
    records: [],
    page: 1,
    totalPages: 0,
    totalCount: 0,
    pageSize: 10,
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
  { path: "/control/settings", loader: settingsLoader },
  { path: "/control/issues", loader: issuesLoader },
  { path: "/control/prs", loader: prsLoader },
  { path: "/control/actions", loader: actionsLoader },
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

describe.each([
  { path: "/control/issues", loader: issuesLoader, kind: "issue" },
  { path: "/control/prs", loader: prsLoader, kind: "pull" },
  { path: "/control/actions", loader: actionsLoader, kind: "run" },
])("Control pagination ($path)", ({ path, loader, kind }) => {
  it.each([
    { query: "", page: 1, pageSize: 10 },
    { query: "?page=3&pageSize=5", page: 3, pageSize: 5 },
    { query: "?page=2&pageSize=25", page: 2, pageSize: 25 },
    { query: "?page=2&pageSize=50", page: 2, pageSize: 50 },
    { query: "?page=-1&pageSize=0", page: 1, pageSize: 10 },
    { query: "?page=1.5&pageSize=12", page: 1, pageSize: 10 },
    { query: "?page=1000001&pageSize=1000000", page: 1, pageSize: 10 },
    { query: "?page=invalid&pageSize=invalid", page: 1, pageSize: 10 },
  ])("validates $query before querying records", async ({ query, page, pageSize }) => {
    vi.mocked(listRecords).mockClear();
    await loader(args("admin", `${path}${query}`));
    expect(listRecords).toHaveBeenCalledExactlyOnceWith(kind, page, pageSize);
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
