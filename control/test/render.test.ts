import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { summarizeRenderMetrics, type RenderMetrics } from "../render";

const now = "2026-11-18T12:00:00Z";
const sample = "2026-11-18T11:59:00Z";
const old = "2026-11-18T11:30:00Z";
const token = "render-unit-test-key";
const fetchMock = vi.fn<typeof fetch>();
const resources = [
  { id: "srv-web", name: "web-app-blueprint-web", type: "web_service" },
  { id: "srv-worker", name: "web-app-blueprint-worker", type: "background_worker" },
  { id: "srv-storage", name: "web-app-blueprint-storage", type: "web_service" },
  { id: "red-queue", name: "web-app-blueprint-queue", type: "key_value" },
  { id: "dpg-app", name: "web-app-blueprint-db", type: "postgres" },
  { id: "dpg-control", name: "web-app-blueprint-control-db", type: "postgres" },
];

function series(value: number, unit = "bytes", timestamp = sample, statusCode?: string) {
  return {
    labels: statusCode ? [{ field: "statusCode", value: statusCode }] : [],
    unit,
    values: [{ timestamp, value }],
  };
}

function respond(input: string | URL | Request) {
  const url = new URL(String(input));
  if (url.pathname.startsWith("/v1/blueprints/")) return Response.json({ resources });
  const values: Record<string, ReturnType<typeof series>[]> = {
    cpu: [series(0.1, "cpu"), series(0.2, "cpu"), series(0.9, "cpu", old)],
    "cpu-limit": [series(0.25, "cpu"), series(0.25, "cpu"), series(0.25, "cpu", old)],
    memory: [series(256 * 1024 ** 2)],
    "memory-limit": [series(512 * 1024 ** 2)],
    "disk-usage": [series(2 * 1024 ** 3)],
    "disk-capacity": [series(10 * 1024 ** 3)],
    "active-connections": [series(12, "count")],
    "instance-count": [series(2, "count")],
    "http-requests": [
      series(10, "count", sample, "200"),
      series(5, "count", sample, "204"),
      series(5, "count", sample, "503"),
    ],
    "http-latency": [series(0.15, "seconds"), series(0.2, "seconds")],
    bandwidth: [series(100, "bytes", old), series(100, "bytes")],
  };
  const endpoint = url.pathname.split("/").at(-1)!;
  if (!Object.hasOwn(values, endpoint)) throw new Error(`Unexpected endpoint: ${endpoint}`);
  return Response.json(values[endpoint]);
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));
  vi.stubEnv("RENDER_API_KEY", token);
  vi.stubEnv("RENDER_BLUEPRINT_ID", "exs-test");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input) => respond(input));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Render metrics", () => {
  it("combines current instances, calculates capacity and 5xx rate, and does not sum percentiles", async () => {
    const { readRenderMetrics } = await import("../render.server");
    const result = await readRenderMetrics("web");
    expect(result.state).toBe("ready");
    expect(result.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "CPU", value: "60%" }),
        expect.objectContaining({ label: "Memory", value: "256 MiB", detail: "of 512 MiB · 50%" }),
        expect.objectContaining({ label: "Requests", value: "20" }),
        expect.objectContaining({
          label: "Server errors",
          value: "5",
          detail: "25% of requests · last hour",
        }),
        expect.objectContaining({ label: "Response time", value: "200 ms" }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain(token);
    const calls = fetchMock.mock.calls.map(([input, options]) => ({
      url: new URL(String(input)),
      options,
    }));
    expect(
      calls.every(
        ({ url, options }) =>
          url.origin === "https://api.render.com" && options?.redirect === "error",
      ),
    ).toBe(true);
    const http = calls.find(({ url }) => url.pathname.endsWith("/http-requests"))!;
    expect(http.url.searchParams.get("resource")).toBe("srv-web");
    expect(http.url.searchParams.get("aggregateBy")).toBe("statusCode");
    const bandwidth = calls.find(({ url }) => url.pathname.endsWith("/bandwidth"))!;
    expect(bandwidth.url.searchParams.get("startTime")).toBe("2026-11-17T12:00:00.000Z");
    expect(bandwidth.url.searchParams.has("resolutionSeconds")).toBe(false);
  });

  it.each([
    { node: "database", id: "dpg-app", disk: true, connections: true },
    { node: "controlDatabase", id: "dpg-control", disk: true, connections: true },
    { node: "redis", id: "red-queue", disk: false, connections: true },
    { node: "storage", id: "srv-storage", disk: true, connections: false },
    { node: "worker", id: "srv-worker", disk: false, connections: false },
  ] as const)("reads the applicable metrics for $node", async ({ node, id, disk, connections }) => {
    const { readRenderMetrics } = await import("../render.server");
    const result = await readRenderMetrics(node);
    expect(result.state).toBe("ready");
    expect(result.metrics.some((metric) => metric.label === "Disk")).toBe(disk);
    expect(result.metrics.some((metric) => metric.label === "Connections")).toBe(connections);
    const urls = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .filter((url) => url.pathname.includes("/metrics/"));
    expect(urls.every((url) => url.searchParams.get("resource") === id)).toBe(true);
    if (node !== "storage") expect(urls.some((url) => url.pathname.includes("http-"))).toBe(false);
    if (disk) {
      expect(summarizeRenderMetrics(result)).toMatchObject({
        health: "healthy",
        metric: { label: "Disk", value: "2 / 10 GiB" },
      });
    }
  });

  it("shares concurrent reads and the one-minute cache, and invalidates it on credential changes", async () => {
    const { readRenderMetrics } = await import("../render.server");
    const first = readRenderMetrics("redis");
    await Promise.all([first, readRenderMetrics("redis")]);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    const count = fetchMock.mock.calls.length;
    await readRenderMetrics("redis");
    expect(fetchMock).toHaveBeenCalledTimes(count);
    vi.advanceTimersByTime(60_001);
    await readRenderMetrics("redis");
    expect(fetchMock).toHaveBeenCalledTimes(count * 2);
    vi.stubEnv("RENDER_API_KEY", "replacement-key");
    await readRenderMetrics("redis");
    expect(fetchMock).toHaveBeenCalledTimes(count * 3);
  });

  it("shares the Blueprint and card readings with on-demand details", async () => {
    const { readRenderMetrics } = await import("../render.server");
    const [db, worker] = await Promise.all([
      readRenderMetrics("database", "overview"),
      readRenderMetrics("worker", "overview"),
    ]);
    expect(db.metrics.map(({ label }) => label)).toEqual(["Disk", "Connections"]);
    expect(worker.metrics.map(({ label }) => label)).toEqual(["CPU", "Memory"]);
    expect(fetchMock).toHaveBeenCalledTimes(8);
    const detail = await readRenderMetrics("worker");
    expect(detail.metrics.map(({ label }) => label)).toContain("Outbound");
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it("pauses new reads until the Render rate-limit reset", async () => {
    const { readRenderMetrics } = await import("../render.server");
    fetchMock.mockImplementationOnce(
      async () =>
        new Response(null, {
          status: 429,
          headers: { "RateLimit-Reset": String(Date.now() / 1000 + 120) },
        }),
    );
    expect((await readRenderMetrics("worker")).state).toBe("error");
    vi.advanceTimersByTime(60_001);
    expect((await readRenderMetrics("database")).state).toBe("error");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_001);
    expect((await readRenderMetrics("worker")).state).toBe("ready");
  });

  it("returns setup guidance without requests, and skips systems outside Render", async () => {
    const { readRenderMetrics } = await import("../render.server");
    vi.stubEnv("RENDER_API_KEY", "");
    expect(await readRenderMetrics("web")).toMatchObject({ state: "unconfigured", metrics: [] });
    expect(await readRenderMetrics("mail")).toMatchObject({ state: "empty", metrics: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves available metrics when one endpoint fails without exposing provider bodies", async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).includes("/cpu?") ? new Response(token, { status: 403 }) : respond(input),
    );
    const { readRenderMetrics } = await import("../render.server");
    const result = await readRenderMetrics("web");
    expect(result.state).toBe("partial");
    expect(result.metrics.find((metric) => metric.label === "CPU")?.value).toBeNull();
    expect(result.metrics.find((metric) => metric.label === "Memory")?.value).toBe("256 MiB");
    expect(JSON.stringify(result)).not.toContain(token);
  });

  it("keeps absent and malformed metrics unavailable instead of reporting zero", async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).includes("/blueprints/")
        ? respond(input)
        : Response.json(String(input).includes("/cpu?") ? { unexpected: token } : []),
    );
    const { readRenderMetrics } = await import("../render.server");
    const result = await readRenderMetrics("web");
    expect(result.state).toBe("error");
    expect(result.metrics.every((metric) => metric.value === null)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(token);
  });

  it("rejects missing or ambiguous resource names before requesting metrics", async () => {
    fetchMock.mockResolvedValue(Response.json({ resources: [resources[0], resources[0]] }));
    const { readRenderMetrics } = await import("../render.server");
    expect(await readRenderMetrics("web")).toMatchObject({ state: "error", metrics: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("Site map health", () => {
  it.each([
    { used: 79, health: "healthy" },
    { used: 80, health: "warning" },
    { used: 95, health: "critical" },
  ])("labels fresh utilization of $used% as $health", ({ used, health }) => {
    const result: RenderMetrics = {
      node: "database",
      state: "ready",
      fetchedAt: now,
      metrics: [
        {
          label: "Disk",
          value: `${used} GiB`,
          detail: "",
          sampledAt: sample,
          utilizationPercent: used,
        },
      ],
    };
    expect(summarizeRenderMetrics(result).health).toBe(health);
    result.metrics[0].sampledAt = old;
    expect(summarizeRenderMetrics(result)).toEqual({ health: "warning" });
  });

  it("keeps unconfigured resources neutral", () => {
    expect(summarizeRenderMetrics({ node: "web", state: "unconfigured", metrics: [] })).toEqual({
      health: "unknown",
    });
  });
});
