import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { RouterContextProvider } from "react-router";
import { action } from "~/web/routes/webhooks/github";
import type { Route } from "../routes/webhooks/+types/github";
import { getConnection, updateConnection } from "~/control/db/repositories/github.server";
import { enqueueGithubSync } from "~/worker/jobs/sync-github";
import {
  KEY,
  CONNECTION_ID,
  DELIVERY_ID,
  TOKEN,
  connection,
} from "~/integrations/github/test/fixtures";

vi.mock("~/control/db/repositories/github.server", () => ({
  getConnection: vi.fn(),
  updateConnection: vi.fn(),
}));
vi.mock("~/worker/jobs/sync-github", () => ({ enqueueGithubSync: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CONTROL_ENCRYPTION_KEY", KEY);
  vi.mocked(getConnection).mockResolvedValue(connection());
});
afterEach(() => vi.unstubAllEnvs());
function request(event = "issues", repositoryId = 123, extraHeaders: HeadersInit = {}) {
  const body = JSON.stringify({
    action: "opened",
    repository: { id: repositoryId },
    issue: { id: 10, number: 1 },
  });
  return new Request(`https://control.example/webhooks/github?connection=${CONNECTION_ID}`, {
    method: "POST",
    body,
    headers: {
      "x-github-event": event,
      "x-github-delivery": DELIVERY_ID,
      "x-hub-signature-256": `sha256=${createHmac("sha256", "hook-secret").update(body).digest("hex")}`,
      ...extraHeaders,
    },
  });
}
function args(request: Request) {
  return {
    request,
    url: new URL(request.url),
    pattern: "/webhooks/github",
    params: {},
    context: new RouterContextProvider(),
  } satisfies Route.ActionArgs;
}
describe("GitHub webhook", () => {
  it("accepts a signed delivery and queues only record identifiers before acknowledging", async () => {
    const response = await action(args(request()));
    expect(response.status).toBe(202);
    expect(enqueueGithubSync).toHaveBeenCalledWith(
      {
        kind: "record",
        connectionId: CONNECTION_ID,
        recordKind: "issue",
        githubId: 10,
        number: 1,
        deleted: false,
      },
      DELIVERY_ID,
    );
    expect(JSON.stringify(vi.mocked(enqueueGithubSync).mock.calls)).not.toContain(TOKEN);
    expect(updateConnection).toHaveBeenCalledWith(
      CONNECTION_ID,
      expect.objectContaining({ lastWebhookAt: expect.any(Date) }),
    );
  });
  it("passes the same delivery identifier on redelivery for queue deduplication", async () => {
    await action(args(request()));
    await action(args(request()));
    expect(vi.mocked(enqueueGithubSync).mock.calls.map(([, id]) => id)).toEqual([
      DELIVERY_ID,
      DELIVERY_ID,
    ]);
  });
  it.each([
    [
      "invalid signature",
      () => request("issues", 123, { "x-hub-signature-256": "sha256=invalid" }),
      401,
    ],
    ["another repository", () => request("issues", 999), 403],
    ["missing delivery ID", () => request("issues", 123, { "x-github-delivery": "" }), 400],
  ] as const)("rejects %s without queueing", async (_name, makeRequest, status) => {
    expect((await action(args(makeRequest()))).status).toBe(status);
    expect(enqueueGithubSync).not.toHaveBeenCalled();
  });
  it("acknowledges the initial ping while the hook is being connected", async () => {
    vi.mocked(getConnection).mockResolvedValue(
      connection({ status: "connecting", webhookId: null }),
    );
    expect((await action(args(request("ping")))).status).toBe(204);
    expect(enqueueGithubSync).not.toHaveBeenCalled();
  });
  it("does not acknowledge success when queue persistence fails", async () => {
    vi.mocked(enqueueGithubSync).mockRejectedValue(new Error("Redis unavailable"));
    const response = await action(args(request()));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("Redis");
  });
});
