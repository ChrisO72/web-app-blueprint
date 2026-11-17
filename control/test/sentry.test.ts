import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readServiceTelemetry, buildSentryQuery } from "../sentry.server";
import { telemetryQuerySchema } from "../telemetry";
import { site } from "~/system.config";

const TOKEN = "private-reader-token";
const fetchMock = vi.fn<typeof fetch>();
const log = {
  "sentry.item_id": "log-1",
  timestamp: "2026-11-17T12:00:00Z",
  message: "Request completed",
  severity: "info",
  service: "web",
  environment: "production",
  release: "blueprint@1",
  trace: "trace-1",
  "http.route": "control",
  "http.response.status_code": 200,
  arbitrarySecret: TOKEN,
};
const query = (values: Record<string, string> = {}) =>
  telemetryQuerySchema.parse({ node: "web", ...values });
const requested = () =>
  new URL(
    String(fetchMock.mock.calls.find(([url]) => !String(url).includes("/environments/"))?.[0]),
  );

beforeEach(() => {
  vi.stubEnv("SENTRY_ORG", "example-org");
  vi.stubEnv("SENTRY_PROJECT", "example-project");
  vi.stubEnv("SENTRY_READ_TOKEN", TOKEN);
  vi.stubEnv("SENTRY_URL", "https://sentry.example");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url) =>
    String(url).includes("/environments/")
      ? Response.json([{ name: "production", token: TOKEN }, { name: "staging" }])
      : Response.json({ data: [log] }),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Control Sentry reader", () => {
  it.each(Object.keys(site.systems).filter((node) => node !== "web" && node !== "worker"))(
    "returns an empty panel for %s without contacting Sentry",
    async (node) => {
      expect(await readServiceTelemetry(query({ node }))).toMatchObject({
        state: "empty",
        logs: [],
        issues: [],
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it.each(["SENTRY_READ_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT"])(
    "disables reading without %s",
    async (key) => {
      vi.stubEnv(key, "");
      expect(await readServiceTelemetry(query())).toMatchObject({ state: "unconfigured" });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it("does not substitute agent or upload credentials", async () => {
    vi.stubEnv("SENTRY_READ_TOKEN", "");
    vi.stubEnv("SENTRY_AGENT_TOKEN", "agent-secret");
    vi.stubEnv("SENTRY_UPLOAD_TOKEN", "upload-secret");
    expect(await readServiceTelemetry(query())).toMatchObject({ state: "unconfigured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("requests only logs from the fixed project with bounded pages and selected filters", async () => {
    const result = await readServiceTelemetry(
      query({
        period: "7d",
        environment: "staging",
        source: "browser",
        severity: "warning",
        cursor: "0:25:0",
      }),
    );
    const url = requested();
    expect(url.origin).toBe("https://sentry.example");
    expect(url.pathname).toBe("/api/0/organizations/example-org/events/");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      dataset: "logs",
      project: "example-project",
      statsPeriod: "7d",
      environment: "staging",
      per_page: "25",
      sort: "-timestamp",
      cursor: "0:25:0",
      query: "service:browser severity:[warn,warning]",
    });
    expect(result.environments).toEqual(["production", "staging"]);
    expect(result.logs[0]).toMatchObject({
      id: "log-1",
      service: "web",
      context: expect.arrayContaining([{ label: "Route", value: "control" }]),
    });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    for (const [, options] of fetchMock.mock.calls) {
      expect(options).toMatchObject({
        redirect: "error",
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      expect(options?.signal).toBeInstanceOf(AbortSignal);
    }
  });
  it("defaults to hosted Sentry when the URL is blank", async () => {
    vi.stubEnv("SENTRY_URL", "");
    await readServiceTelemetry(query());
    expect(requested().origin).toBe("https://sentry.io");
  });
  it.each(["file:///tmp/sentry", "https://user:password@sentry.example"])(
    "rejects an invalid API URL",
    async (url) => {
      vi.stubEnv("SENTRY_URL", url);
      expect(await readServiceTelemetry(query())).toMatchObject({ state: "unconfigured" });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it("keeps worker scoped even when a browser source is requested", async () => {
    await readServiceTelemetry(query({ node: "worker", source: "browser" }));
    expect(requested().searchParams.get("query")).toBe("service:worker");
  });
  it("includes browser and server for Web by default", () => {
    expect(buildSentryQuery(query())).toBe("service:[web,browser]");
  });
  it("quotes text so it cannot override service or severity filters", () => {
    const q = 'failure" OR service:worker \\ *?';
    expect(buildSentryQuery(query({ q, severity: "error" }))).toBe(
      `service:[web,browser] severity:error message:${JSON.stringify(`*${q.replace(/[\\*?]/g, "\\$&")}*`)}`,
    );
    expect(buildSentryQuery(query({ tab: "errors", q: "service:worker" }))).toBe(
      'service:[web,browser] issue.category:error "service:worker"',
    );
  });
  it("projects only matching issue statistics and safe context", async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).includes("/environments/")
        ? Response.json([])
        : Response.json([
            {
              id: "1",
              title: "Error",
              status: "ignored",
              count: "999",
              firstSeen: "old",
              lastSeen: "old",
              filtered: { count: "2", firstSeen: "matching-first", lastSeen: "matching-last" },
              culprit: "loader",
              permalink: "https://example.sentry.io/issues/1/",
              private: TOKEN,
            },
            {
              id: "2",
              title: "Another error",
              status: "resolved",
              count: "100",
              filtered: null,
              permalink: "javascript:alert(1)",
            },
          ]),
    );
    const result = await readServiceTelemetry(query({ tab: "errors", status: "archived" }));
    expect(requested().pathname).toBe("/api/0/organizations/example-org/issues/");
    expect(requested().searchParams.get("query")).toBe(
      "service:[web,browser] issue.category:error is:ignored",
    );
    expect(requested().searchParams.get("limit")).toBe("25");
    expect(requested().searchParams.get("sort")).toBe("date");
    expect(result.issues[0]).toMatchObject({
      count: "2",
      firstSeen: "matching-first",
      lastSeen: "matching-last",
      status: "archived",
    });
    expect(result.issues[1]).toMatchObject({
      count: undefined,
      firstSeen: undefined,
      lastSeen: undefined,
      url: undefined,
    });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(JSON.stringify(result)).not.toContain("999");
  });
  it("only uses pagination links with results and never forwards their host", async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).includes("/environments/")
        ? Response.json([])
        : Response.json(
            { data: [] },
            {
              headers: {
                Link: '<https://other.example/events/?cursor=0%3A0%3A1>; rel="previous"; results="false", <https://other.example/events/?cursor=0%3A25%3A0>; rel="next"; results="true"',
              },
            },
          ),
    );
    const result = await readServiceTelemetry(query());
    expect(result.previous).toBeUndefined();
    expect(result.next).toBe("0:25:0");
    await readServiceTelemetry(query({ cursor: result.next! }));
    expect(requested().origin).toBe("https://sentry.example");
  });
  it.each([401, 403, 404, 429, 500])(
    "handles upstream HTTP %s without leaking responses",
    async (status) => {
      fetchMock.mockResolvedValue(new Response(TOKEN, { status }));
      const result = await readServiceTelemetry(query());
      expect(result.state).toBe("error");
      expect(JSON.stringify(result)).not.toContain(TOKEN);
      if (status === 429) expect(result.message).toContain("rate limiting");
    },
  );
  it.each([new DOMException("secret timeout", "TimeoutError"), new Error(TOKEN)])(
    "handles failed requests",
    async (error) => {
      fetchMock.mockRejectedValue(error);
      const result = await readServiceTelemetry(query());
      expect(result.state).toBe("error");
      expect(JSON.stringify(result)).not.toContain(TOKEN);
      expect(JSON.stringify(result)).not.toContain("secret timeout");
    },
  );
  it("handles invalid upstream payloads", async () => {
    fetchMock.mockResolvedValue(Response.json({ unexpected: TOKEN }));
    expect(await readServiceTelemetry(query())).toMatchObject({ state: "error" });
  });
  it.each([
    { node: "unknown" },
    { period: "30d" },
    { severity: "unknown" },
    { source: "worker" },
    { status: "deleted" },
    { q: "a".repeat(201) },
    { cursor: "a".repeat(513) },
  ])("rejects invalid filters: %j", (values) => {
    expect(telemetryQuerySchema.safeParse({ node: "web", ...values }).success).toBe(false);
  });
});
