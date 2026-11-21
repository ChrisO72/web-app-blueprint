import { z } from "zod";
import { hasTelemetry, type TelemetryQuery, type TelemetryResult } from "./telemetry";

const settingsSchema = z.object({
  SENTRY_ORG: z.string().trim().min(1),
  SENTRY_PROJECT: z.string().trim().min(1),
  SENTRY_READ_TOKEN: z.string().trim().min(1),
  SENTRY_URL: z.preprocess(
    (value) => (value === "" || value === undefined ? "https://sentry.io" : value),
    z.url().refine((value) => {
      const url = new URL(value);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash
      );
    }),
  ),
});
const text = z.string().nullish();
const scalar = z.union([z.string(), z.number(), z.boolean()]).nullish();
const logSchema = z.object({
  "sentry.item_id": z.string(),
  timestamp: z.string(),
  severity: text,
  service: text,
  message: text,
  environment: scalar,
  release: scalar,
  trace: scalar,
  "http.route": scalar,
  "http.response.status_code": scalar,
  "job.name": scalar,
  "job.id": scalar,
  "job.attempt": scalar,
});
const issueSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  culprit: text,
  permalink: text,
  filtered: z
    .object({
      count: z.union([z.string(), z.number()]).nullish(),
      firstSeen: text,
      lastSeen: text,
    })
    .nullish(),
});
const contextFields = {
  environment: "Environment",
  release: "Release",
  trace: "Trace ID",
  "http.route": "Route",
  "http.response.status_code": "HTTP status",
  "job.name": "Job",
  "job.id": "Job ID",
  "job.attempt": "Attempt",
} as const;
const emptyPage = { logs: [], issues: [], environments: [] };

// Quote the entire search value so it cannot add/override Sentry filters.
export function buildSentryQuery(query: TelemetryQuery) {
  const service =
    query.node === "worker" ? "worker" : query.source === "all" ? "[web,browser]" : query.source;
  const filters = [`service:${service}`];
  if (query.tab === "errors") {
    filters.push("issue.category:error");
    if (query.status !== "all")
      filters.push(`is:${query.status === "archived" ? "ignored" : query.status}`);
  } else if (query.severity !== "all") {
    filters.push(`severity:${query.severity === "warning" ? "[warn,warning]" : query.severity}`);
  }
  if (query.q) {
    const literal = query.q.replace(/[\\*?]/g, "\\$&");
    filters.push(
      query.tab === "logs" ? `message:${JSON.stringify(`*${literal}*`)}` : JSON.stringify(literal),
    );
  }
  return filters.join(" ");
}

function pagination(link: string | null) {
  const result: { previous?: string; next?: string } = {};
  for (const entry of link?.split(/,(?=\s*<)/) ?? []) {
    if (!/results="true"/.test(entry)) continue;
    const rel = entry.match(/rel="(previous|next)"/)?.[1];
    const url = entry.match(/<([^>]+)>/)?.[1];
    if ((rel === "previous" || rel === "next") && url) {
      const cursor = new URL(url).searchParams.get("cursor");
      if (cursor && cursor.length <= 512) result[rel] = cursor;
    }
  }
  return result;
}

function safeLink(value: string | null | undefined) {
  if (!value) return undefined;
  const parsed = z.url().safeParse(value);
  return parsed.success && ["http:", "https:"].includes(new URL(value).protocol)
    ? value
    : undefined;
}

class SentryReadError extends Error {
  constructor(readonly status: number) {
    super("Sentry request failed");
  }
}

export async function readServiceTelemetry(
  query: TelemetryQuery,
  signal?: AbortSignal,
): Promise<TelemetryResult> {
  if (!hasTelemetry(query.node)) return { ...emptyPage, state: "empty" };
  const settings = settingsSchema.safeParse(process.env);
  if (!settings.success) {
    return {
      ...emptyPage,
      state: "unconfigured",
      message:
        "Configure SENTRY_ORG, SENTRY_PROJECT, and SENTRY_READ_TOKEN on the web server to view telemetry.",
    };
  }
  const {
    SENTRY_ORG: org,
    SENTRY_PROJECT: project,
    SENTRY_READ_TOKEN: token,
    SENTRY_URL: host,
  } = settings.data;
  const base = new URL(`${host.replace(/\/$/, "")}/api/0/`);
  const requestSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
    : AbortSignal.timeout(10_000);
  async function get(path: string, params = new URLSearchParams()) {
    const url = new URL(path, base);
    url.search = params.toString();
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: requestSignal,
      redirect: "error",
    });
    if (!response.ok) throw new SentryReadError(response.status);
    return response;
  }
  const params = new URLSearchParams({
    project,
    statsPeriod: query.period,
    query: buildSentryQuery(query),
    sort: query.tab === "logs" ? "-timestamp" : "date",
  });
  if (query.environment) params.set("environment", query.environment);
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.tab === "logs") {
    params.set("dataset", "logs");
    params.set("per_page", "25");
    for (const field of [
      "sentry.item_id",
      "timestamp",
      "message",
      "severity",
      "service",
      ...Object.keys(contextFields),
    ])
      params.append("field", field);
  } else params.set("limit", "25");
  try {
    const orgPath = `organizations/${encodeURIComponent(org)}/`;
    const [response, environmentResponse] = await Promise.all([
      get(`${orgPath}${query.tab === "logs" ? "events" : "issues"}/`, params),
      get(`projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/environments/`),
    ]);
    const environments = z
      .array(z.object({ name: z.string() }))
      .parse(await environmentResponse.json())
      .map((entry) => entry.name);
    const page = {
      ...emptyPage,
      environments,
      ...pagination(response.headers.get("link")),
      state: "ready" as const,
    };
    if (query.tab === "logs") {
      const body = z.object({ data: z.array(logSchema) }).parse(await response.json());
      return {
        ...page,
        logs: body.data.map((row) => ({
          id: row["sentry.item_id"],
          timestamp: row.timestamp,
          severity: row.severity ?? "unknown",
          service: row.service ?? "unknown",
          message: row.message ?? "",
          context: Object.entries(contextFields).flatMap(([key, label]) => {
            const value = row[key as keyof typeof contextFields];
            return value === null || value === undefined ? [] : [{ label, value: String(value) }];
          }),
        })),
      };
    }
    const body = z.array(issueSchema).parse(await response.json());
    return {
      ...page,
      issues: body.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status === "ignored" ? "archived" : row.status,
        count: row.filtered?.count == null ? undefined : String(row.filtered.count),
        firstSeen: row.filtered?.firstSeen ?? undefined,
        lastSeen: row.filtered?.lastSeen ?? undefined,
        culprit: row.culprit ?? undefined,
        url: safeLink(row.permalink),
      })),
    };
  } catch (error) {
    let message = "Sentry could not be reached. Please try again.";
    if (error instanceof SentryReadError) {
      if (error.status === 401 || error.status === 403)
        message = "Sentry access was denied. Check the read token and its project permissions.";
      else if (error.status === 429)
        message = "Sentry is rate limiting requests. Please wait before refreshing.";
      else if (error.status === 404)
        message = "The configured Sentry organization or project could not be found.";
    }
    return { ...emptyPage, state: "error", message };
  }
}
