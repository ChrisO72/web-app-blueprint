import { describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";
import type { User } from "~/db/repositories/users";
import { authenticatedUserContext } from "~/web/lib/session.server";
import { loader as overviewLoader } from "~/web/routes/control/index";
import { loader as activityLoader } from "~/web/routes/control/activity";
import { loader as settingsLoader } from "~/web/routes/control/settings";
import type { Route } from "../routes/control/+types/index";

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
])("Control access ($path)", ({ path, loader }) => {
  it("allows the existing application admin", () => {
    expect(loader(args("admin", path))).toBeNull();
  });

  it.each(["user", "viewer"] as const)(
    "redirects a %s requesting Control directly",
    async (role) => {
      await expect(Promise.resolve().then(() => loader(args(role, path)))).rejects.toMatchObject({
        status: 302,
      });
    },
  );
});
