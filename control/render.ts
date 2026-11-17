import { z } from "zod";
import { site, type SystemId } from "~/system.config";

export function renderResourceName(node: SystemId) {
  const system = site.systems[node];
  return "renderResource" in system ? system.renderResource : undefined;
}

export const renderQuerySchema = z.object({
  node: z.custom<SystemId>(
    (value) => typeof value === "string" && Object.hasOwn(site.systems, value),
  ),
});

export type RenderMetric = {
  label: string;
  value: string | null;
  detail: string;
  sampledAt?: string;
};

export type RenderMetrics = {
  node: SystemId;
  state: "ready" | "partial" | "empty" | "unconfigured" | "error";
  metrics: RenderMetric[];
  fetchedAt?: string;
  message?: string;
};
