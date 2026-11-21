import { z } from "zod";
import { site, type SystemId } from "~/system.config";

export const telemetryQuerySchema = z.object({
  node: z.custom<SystemId>(
    (value) => typeof value === "string" && Object.hasOwn(site.systems, value),
  ),
  tab: z.enum(["logs", "errors"]).default("logs"),
  period: z.enum(["1h", "24h", "7d"]).default("24h"),
  environment: z.string().trim().max(100).default(""),
  source: z.enum(["all", "web", "browser"]).default("all"),
  severity: z.enum(["all", "debug", "info", "warning", "error", "fatal"]).default("all"),
  status: z.enum(["all", "unresolved", "resolved", "archived"]).default("all"),
  q: z.string().trim().max(200).default(""),
  cursor: z.string().max(512).default(""),
});

export type TelemetryQuery = z.infer<typeof telemetryQuerySchema>;
export const hasTelemetry = (node: SystemId) => node === "web" || node === "worker";
export const telemetryQueryKey = (query: TelemetryQuery) => new URLSearchParams(query).toString();

export type TelemetryLog = {
  id: string;
  timestamp: string;
  severity: string;
  service: string;
  message: string;
  context: { label: string; value: string }[];
};
export type TelemetryIssue = {
  id: string;
  title: string;
  status: string;
  count?: string;
  firstSeen?: string;
  lastSeen?: string;
  culprit?: string;
  url?: string;
};
export type TelemetryPage = {
  logs: TelemetryLog[];
  issues: TelemetryIssue[];
  previous?: string;
  next?: string;
};
export type TelemetryResult = TelemetryPage & {
  state: "ready" | "empty" | "unconfigured" | "error";
  environments: string[];
  message?: string;
};
export type TelemetryResponse = TelemetryResult & { key: string };
