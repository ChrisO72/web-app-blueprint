import { z } from "zod";
import { site, type SystemId } from "~/system.config";

export function renderResourceName(node: SystemId) {
  const system = site.systems[node];
  return "renderResource" in system ? system.renderResource : undefined;
}

export const renderNodes = (Object.keys(site.systems) as SystemId[]).filter(renderResourceName);

export const renderQuerySchema = z.union([
  z.object({
    node: z.custom<SystemId>(
      (value) => typeof value === "string" && Object.hasOwn(site.systems, value),
    ),
  }),
  z.object({ scope: z.literal("overview"), node: z.never().optional() }),
]);

export type RenderMetric = {
  label: string;
  value: string | null;
  detail: string;
  sampledAt?: string;
  capacity?: string;
  utilizationPercent?: number;
};

export type RenderMetrics = {
  node: SystemId;
  state: "ready" | "partial" | "empty" | "unconfigured" | "error";
  metrics: RenderMetric[];
  fetchedAt?: string;
  message?: string;
};

export const renderRefreshInterval = 60_000;

export function isStaleRenderMetric(metric: RenderMetric, fetchedAt?: string) {
  return Boolean(
    fetchedAt &&
    metric.sampledAt &&
    Date.parse(fetchedAt) - Date.parse(metric.sampledAt) > 3 * renderRefreshInterval,
  );
}

export const primaryLabels: Partial<Record<SystemId, readonly string[]>> = {
  web: ["Response time", "Server errors", "CPU"],
  worker: ["CPU", "Memory"],
  redis: ["Memory", "Connections"],
  database: ["Disk", "Connections"],
  controlDatabase: ["Disk", "Connections"],
  storage: ["Disk", "Memory"],
};

type RenderSummary = {
  health: "healthy" | "warning" | "critical" | "unknown";
  metric?: { label: string; value: string };
};

export function summarizeRenderMetrics(result: RenderMetrics): RenderSummary {
  const reported = result.metrics.filter((metric) => metric.value !== null);
  const current = reported.filter((metric) => !isStaleRenderMetric(metric, result.fetchedAt));
  const preferences = primaryLabels[result.node] ?? [];
  const primary =
    preferences.map((label) => current.find((metric) => metric.label === label)).find(Boolean) ??
    current[0];
  const capacityReadings = current.flatMap(({ utilizationPercent }) =>
    utilizationPercent === undefined ? [] : [utilizationPercent],
  );
  const peak = Math.max(...capacityReadings);
  const health =
    peak >= 95
      ? "critical"
      : peak >= 80 || result.state === "partial" || reported.length > current.length
        ? "warning"
        : result.state === "ready" && capacityReadings.length
          ? "healthy"
          : "unknown";
  if (!primary?.value) return { health };
  const capacity =
    primary.label === "Disk" || primary.label === "Memory" ? primary.capacity : undefined;
  const unit = capacity?.match(/\s.+$/)?.[0];
  const used =
    unit && primary.value.endsWith(unit) ? primary.value.slice(0, -unit.length) : primary.value;
  return {
    health,
    metric: {
      label: primary.label,
      value: capacity ? `${used} / ${capacity}` : primary.value,
    },
  };
}
