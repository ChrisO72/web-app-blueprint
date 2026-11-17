import { z } from "zod";
import type { SystemId } from "~/system.config";
import { renderResourceName, type RenderMetric, type RenderMetrics } from "./render";

const settingsSchema = z.object({
  RENDER_API_KEY: z.string().trim().min(1),
  RENDER_BLUEPRINT_ID: z
    .string()
    .trim()
    .regex(/^exs-[a-z0-9]+$/),
});
const blueprintSchema = z.object({
  resources: z.array(z.object({ id: z.string(), name: z.string(), type: z.string() })),
});
const seriesSchema = z.array(
  z.object({
    labels: z.array(z.object({ field: z.string(), value: z.string() })),
    unit: z.string(),
    values: z.array(z.object({ timestamp: z.iso.datetime({ offset: true }), value: z.number() })),
  }),
);
type Series = z.infer<typeof seriesSchema>;
type Reading = { value: number; unit: string; timestamp: string };
type Settings = z.infer<typeof settingsSchema>;
type CacheEntry = Settings & { expiresAt: number; result: Promise<RenderMetrics> };
const cache = new Map<SystemId, CacheEntry>();
const hour = 60 * 60 * 1000;
const number = (value: number) =>
  new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value);

// Only combine samples from the latest timestamp, excluding replaced instances' old values.
function current(series: Series, aggregation: "sum" | "max" = "sum"): Reading | undefined {
  const points = series.flatMap((entry) =>
    entry.values.map((point) => ({ ...point, unit: entry.unit })),
  );
  const latest = Math.max(...points.map((point) => Date.parse(point.timestamp)));
  const active = points.filter((point) => Date.parse(point.timestamp) === latest);
  const first = active[0];
  if (!first || active.some((point) => point.unit !== first.unit)) return undefined;
  return {
    ...first,
    value:
      aggregation === "max"
        ? Math.max(...active.map((point) => point.value))
        : active.reduce((sum, point) => sum + point.value, 0),
  };
}

function bytes(unit: string) {
  return (
    {
      b: 1,
      byte: 1,
      bytes: 1,
      kb: 1000,
      mb: 1000 ** 2,
      gb: 1000 ** 3,
      tb: 1000 ** 4,
      kib: 1024,
      mib: 1024 ** 2,
      gib: 1024 ** 3,
      tib: 1024 ** 4,
    } as Record<string, number | undefined>
  )[unit.toLowerCase()];
}

function format(value: number, unit: string) {
  const multiplier = bytes(unit);
  if (multiplier) {
    let amount = value * multiplier;
    const units = ["B", "KiB", "MiB", "GiB", "TiB"];
    let index = 0;
    while (amount >= 1024 && index < units.length - 1) {
      amount /= 1024;
      index++;
    }
    return `${number(amount)} ${units[index]}`;
  }
  if (["s", "second", "seconds"].includes(unit.toLowerCase())) return `${number(value * 1000)} ms`;
  if (["ms", "millisecond", "milliseconds"].includes(unit.toLowerCase()))
    return `${number(value)} ms`;
  return `${number(value)}${["", "count"].includes(unit.toLowerCase()) ? "" : ` ${unit}`}`;
}

function usage(label: string, values: Series, limits: Series): RenderMetric {
  const used = current(values);
  const limit = current(limits);
  const comparable =
    used && limit && (used.unit === limit.unit || (bytes(used.unit) && bytes(limit.unit)));
  const percentage =
    comparable && limit.value > 0
      ? ((used.value * (bytes(used.unit) ?? 1)) / (limit.value * (bytes(limit.unit) ?? 1))) * 100
      : undefined;
  return {
    label,
    value:
      label === "CPU" && percentage !== undefined
        ? `${number(percentage)}%`
        : used
          ? format(used.value, used.unit)
          : null,
    detail: limit
      ? `${label === "CPU" ? "Of allocated CPU" : `of ${format(limit.value, limit.unit)}`}${label !== "CPU" && percentage !== undefined ? ` · ${number(percentage)}%` : ""}`
      : "Capacity unavailable",
    sampledAt: used?.timestamp,
  };
}

class RenderReadError extends Error {
  constructor(readonly status: number) {
    super("Render request failed");
  }
}

function errorMessage(error: unknown) {
  if (error instanceof RenderReadError) {
    if (error.status === 401 || error.status === 403)
      return "Render access was denied. Check the API key's Blueprint and Monitoring read permissions.";
    if (error.status === 429)
      return "Render is rate limiting requests. Wait a minute before refreshing.";
    if (error.status === 404)
      return "The configured Render Blueprint or resource could not be found.";
  }
  return "Render metrics could not be loaded. Try refreshing in a minute.";
}

async function read(node: SystemId, name: string, settings: Settings): Promise<RenderMetrics> {
  const signal = AbortSignal.timeout(10_000);
  async function get(path: string, params = new URLSearchParams()) {
    const url = new URL(path, "https://api.render.com/v1/");
    url.search = params.toString();
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${settings.RENDER_API_KEY}`, Accept: "application/json" },
      signal,
      redirect: "error",
    });
    if (!response.ok) throw new RenderReadError(response.status);
    return response.json() as Promise<unknown>;
  }
  try {
    const blueprint = blueprintSchema.parse(
      await get(`blueprints/${settings.RENDER_BLUEPRINT_ID}`),
    );
    const matches = blueprint.resources.filter((resource) => resource.name === name);
    if (matches.length !== 1)
      return {
        node,
        state: "error",
        metrics: [],
        message: `Render resource “${name}” was not uniquely found in this Blueprint. Check system.config.ts.`,
      };
    const resource = matches[0];
    const now = Date.now();
    const params = new URLSearchParams({
      resource: resource.id,
      startTime: new Date(now - hour).toISOString(),
      endTime: new Date(now).toISOString(),
      resolutionSeconds: "60",
    });
    const failures = new Set<string>();
    async function metric(endpoint: string, extra: Record<string, string> = {}) {
      const query = new URLSearchParams(params);
      for (const [key, value] of Object.entries(extra)) query.set(key, value);
      // Bandwidth has fixed hourly buckets and a reporting delay; use a full day.
      if (endpoint === "bandwidth") {
        query.delete("resolutionSeconds");
        query.set("startTime", new Date(now - 24 * hour).toISOString());
      }
      try {
        return seriesSchema.parse(await get(`metrics/${endpoint}`, query));
      } catch (error) {
        failures.add(errorMessage(error));
        return [];
      }
    }
    const requests: Promise<RenderMetric[]>[] = [
      Promise.all([metric("cpu"), metric("cpu-limit")]).then(([values, limits]) => [
        usage("CPU", values, limits),
      ]),
      Promise.all([metric("memory"), metric("memory-limit")]).then(([values, limits]) => [
        usage("Memory", values, limits),
      ]),
    ];
    if (resource.type === "postgres" || node === "storage")
      requests.push(
        Promise.all([metric("disk-usage"), metric("disk-capacity")]).then(([values, limits]) => [
          usage("Disk", values, limits),
        ]),
      );
    if (["postgres", "redis", "key_value"].includes(resource.type))
      requests.push(
        metric("active-connections").then((values) => {
          const reading = current(values);
          return [
            {
              label: "Connections",
              value: reading ? number(reading.value) : null,
              detail: "Open client connections",
              sampledAt: reading?.timestamp,
            },
          ];
        }),
      );
    if (["web_service", "private_service", "background_worker"].includes(resource.type))
      requests.push(
        metric("instance-count").then((values) => {
          const reading = current(values);
          return [
            {
              label: "Instances",
              value: reading ? number(reading.value) : null,
              detail: "Latest sample",
              sampledAt: reading?.timestamp,
            },
          ];
        }),
      );
    if (resource.type === "web_service") {
      requests.push(
        metric("http-requests", { aggregateBy: "statusCode" }).then((values) => {
          const count = (entries: Series) =>
            entries.reduce(
              (total, entry) => total + entry.values.reduce((sum, point) => sum + point.value, 0),
              0,
            );
          const total = count(values);
          const errors = count(
            values.filter((entry) =>
              entry.labels.some(
                (label) =>
                  ["statusCode", "status_code"].includes(label.field) &&
                  /^5\d\d$/.test(label.value),
              ),
            ),
          );
          return [
            {
              label: "Requests",
              value: values.some((entry) => entry.values.length) ? number(total) : null,
              detail: "Public HTTP · last hour",
            },
            {
              label: "Server errors",
              value: values.some((entry) => entry.values.length) ? number(errors) : null,
              detail:
                total > 0
                  ? `${number((errors / total) * 100)}% of requests · last hour`
                  : "HTTP 5xx · last hour",
            },
          ];
        }),
      );
      requests.push(
        metric("http-latency", { quantile: "0.95" }).then((values) => {
          const reading = current(values, "max");
          return [
            {
              label: "Response time",
              value: reading ? format(reading.value, reading.unit) : null,
              detail: "p95 · highest reported interval",
              sampledAt: reading?.timestamp,
            },
          ];
        }),
      );
    }
    if (["web_service", "private_service", "background_worker"].includes(resource.type))
      requests.push(
        metric("bandwidth").then((values) => {
          const unit = values[0]?.unit;
          const points = values.flatMap((entry) => entry.values);
          return [
            {
              label: "Outbound",
              value:
                points.length && unit !== undefined && values.every((entry) => entry.unit === unit)
                  ? format(
                      points.reduce((sum, point) => sum + point.value, 0),
                      unit,
                    )
                  : null,
              detail: "Last 24h · delayed hourly data",
            },
          ];
        }),
      );
    const metrics = (await Promise.all(requests)).flat();
    const available = metrics.some((entry) => entry.value !== null);
    return {
      node,
      state: failures.size ? (available ? "partial" : "error") : available ? "ready" : "empty",
      metrics,
      fetchedAt: new Date().toISOString(),
      message: failures.size
        ? [...failures].join(" ")
        : available
          ? undefined
          : "Render has no recent metrics for this resource.",
    };
  } catch (error) {
    return { node, state: "error", metrics: [], message: errorMessage(error) };
  }
}

export function readRenderMetrics(node: SystemId): Promise<RenderMetrics> {
  const name = renderResourceName(node);
  if (!name) return Promise.resolve({ node, state: "empty", metrics: [] });
  const parsed = settingsSchema.safeParse(process.env);
  if (!parsed.success)
    return Promise.resolve({
      node,
      state: "unconfigured",
      metrics: [],
      message:
        "Configure RENDER_API_KEY and RENDER_BLUEPRINT_ID on the web server to view Render metrics.",
    });
  const settings = parsed.data;
  const cached = cache.get(node);
  if (
    cached &&
    cached.expiresAt > Date.now() &&
    cached.RENDER_API_KEY === settings.RENDER_API_KEY &&
    cached.RENDER_BLUEPRINT_ID === settings.RENDER_BLUEPRINT_ID
  )
    return cached.result;
  // Share in-flight reads across viewers. Client cancellation must not cancel another viewer's read.
  const result = read(node, name, settings);
  cache.set(node, { ...settings, expiresAt: Date.now() + 60_000, result });
  return result;
}
