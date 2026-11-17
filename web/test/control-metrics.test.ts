import { beforeEach, describe, expect, it, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import { authenticatedUserContext } from "~/web/lib/session.server";
import { loader } from "~/web/routes/control/metrics";
import { readRenderMetrics } from "~/control/render.server";
import type { Route } from "../routes/control/+types/metrics";

vi.mock("~/control/render.server", () => ({ readRenderMetrics: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readRenderMetrics).mockResolvedValue({ node: "web", state: "ready", metrics: [] });
});

function args(role: "admin" | "user" | "viewer", query = "node=web") {
  const context = new RouterContextProvider();
  const now = new Date();
  context.set(authenticatedUserContext, {
    id: 1,
    organizationId: 1,
    email: "admin@example.com",
    firstName: "Admin",
    lastName: null,
    avatarFileId: null,
    emailConfirmedAt: now,
    role,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  const request = new Request(`http://localhost:5173/control/metrics?${query}`);
  return {
    request,
    url: new URL(request.url),
    pattern: "/control/metrics",
    params: {},
    context,
  } satisfies Route.LoaderArgs;
}

describe("Control metrics resource", () => {
  it.each(["user", "viewer"] as const)("rejects %s before reading Render", async (role) => {
    await expect(loader(args(role))).rejects.toMatchObject({ status: 302 });
    expect(readRenderMetrics).not.toHaveBeenCalled();
  });

  it("requires authentication before reading Render", async () => {
    const input = args("admin");
    input.context = new RouterContextProvider();
    await expect(loader(input)).rejects.toBeDefined();
    expect(readRenderMetrics).not.toHaveBeenCalled();
  });

  it.each(["", "node=unknown", "node=__proto__"])(
    "rejects invalid service query %s",
    async (query) => {
      const result = await loader(args("admin", query));
      expect(result.init).toMatchObject({ status: 400 });
      expect(readRenderMetrics).not.toHaveBeenCalled();
    },
  );

  it("uses only the server's resource mapping and prevents browser caching", async () => {
    const result = await loader(
      args("admin", "node=web&resource=srv-other&host=https://other.example&token=other"),
    );
    expect(readRenderMetrics).toHaveBeenCalledExactlyOnceWith("web");
    expect(result.init).toMatchObject({ headers: { "Cache-Control": "no-store" } });
    expect(result.data).toMatchObject({ node: "web", state: "ready" });
  });
});
