import { beforeEach, describe, expect, it, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import { authenticatedUserContext } from "~/web/lib/session.server";
import { loader } from "~/web/routes/control/telemetry";
import { readServiceTelemetry } from "~/control/sentry.server";
import type { Route } from "../routes/control/+types/telemetry";

vi.mock("~/control/sentry.server", () => ({ readServiceTelemetry: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readServiceTelemetry).mockResolvedValue({
    state: "ready",
    logs: [],
    issues: [],
    environments: [],
  });
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
  const request = new Request(`http://localhost:5173/control/telemetry?${query}`);
  return {
    request,
    url: new URL(request.url),
    pattern: "/control/telemetry",
    params: {},
    context,
  } satisfies Route.LoaderArgs;
}
describe("Control telemetry resource", () => {
  it.each(["user", "viewer"] as const)("rejects %s before reading telemetry", async (role) => {
    await expect(loader(args(role))).rejects.toMatchObject({ status: 302 });
    expect(readServiceTelemetry).not.toHaveBeenCalled();
  });
  it("requires an authenticated user", async () => {
    const input = args("admin");
    input.context = new RouterContextProvider();
    await expect(loader(input)).rejects.toBeDefined();
    expect(readServiceTelemetry).not.toHaveBeenCalled();
  });
  it("validates filters before making a Sentry request", async () => {
    const result = await loader(args("admin", "node=web&period=invalid"));
    expect(result.init).toMatchObject({ status: 400, headers: { "Cache-Control": "no-store" } });
    expect(readServiceTelemetry).not.toHaveBeenCalled();
  });
  it("ignores client project/host overrides and returns a request identity", async () => {
    const input = args("admin", "node=worker&project=other&host=https://other.example");
    const result = await loader(input);
    expect(readServiceTelemetry).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ node: "worker", period: "24h", tab: "logs" }),
      input.request.signal,
    );
    expect(vi.mocked(readServiceTelemetry).mock.calls[0][0]).not.toHaveProperty("project");
    expect(result.data.key).toContain("node=worker");
    expect(result.init).toMatchObject({ headers: { "Cache-Control": "no-store" } });
  });
});
