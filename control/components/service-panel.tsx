import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { ArrowPathIcon, MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/16/solid";
import { site, type SystemId } from "~/system.config";
import { Drawer } from "~/web/components/ui-kit/drawer";
import { DialogTitle } from "~/web/components/ui-kit/dialog";
import { Button } from "~/web/components/ui-kit/button";
import { Navbar, NavbarItem, NavbarSection } from "~/web/components/ui-kit/navbar";
import { Field, Label } from "~/web/components/ui-kit/fieldset";
import { Input } from "~/web/components/ui-kit/input";
import { Select } from "~/web/components/ui-kit/select";
import { Badge } from "~/web/components/ui-kit/badge";
import { Text, TextLink } from "~/web/components/ui-kit/text";
import {
  hasTelemetry,
  telemetryQueryKey,
  telemetryQuerySchema,
  type TelemetryQuery,
  type TelemetryResponse,
  type TelemetryLog,
  type TelemetryIssue,
} from "../telemetry";

import { renderResourceName } from "../render";
import { ServiceMetrics } from "./service-metrics";

const date = (value: string) => new Date(value).toLocaleString();

function LogRow({ log }: { log: TelemetryLog }) {
  return (
    <details className="group border-b border-zinc-950/5 py-4 dark:border-white/5">
      <summary className="cursor-pointer list-none rounded-lg text-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <time dateTime={log.timestamp}>{date(log.timestamp)}</time>
          <Badge color={log.severity === "error" || log.severity === "fatal" ? "red" : "zinc"}>
            {log.severity}
          </Badge>
          <span>
            {log.service === "web" ? "Server" : log.service === "browser" ? "Browser" : "Worker"}
          </span>
        </div>
        <p className="truncate text-zinc-950 group-open:hidden dark:text-white">
          {log.message || "(No message)"}
        </p>
        <p className="hidden text-zinc-500 group-open:block dark:text-zinc-400">Hide details</p>
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-sm wrap-anywhere whitespace-pre-wrap text-zinc-950 dark:text-white">
          {log.message || "(No message)"}
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
          {log.context.map(({ label, value }) => (
            <div key={label} className="contents">
              <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
              <dd className="wrap-anywhere text-zinc-700 dark:text-zinc-300">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}

function IssueRow({ issue }: { issue: TelemetryIssue }) {
  return (
    <details className="group border-b border-zinc-950/5 py-4 dark:border-white/5">
      <summary className="cursor-pointer list-none rounded-lg text-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <Badge color={issue.status === "resolved" ? "green" : "zinc"}>{issue.status}</Badge>
          {issue.count !== undefined && <span>{issue.count} occurrences</span>}
          {issue.lastSeen && (
            <time dateTime={issue.lastSeen}>Last seen {date(issue.lastSeen)}</time>
          )}
        </div>
        <p className="truncate text-zinc-950 group-open:wrap-anywhere group-open:whitespace-normal dark:text-white">
          {issue.title}
        </p>
      </summary>
      <div className="mt-3 space-y-3 text-sm">
        {issue.culprit && <Text className="wrap-anywhere">{issue.culprit}</Text>}
        {issue.firstSeen && <Text>First seen {date(issue.firstSeen)}</Text>}
        {issue.url && (
          <TextLink href={issue.url} target="_blank" rel="noreferrer">
            Open in Sentry ↗
          </TextLink>
        )}
      </div>
    </details>
  );
}

export function ServicePanel({
  node,
  open,
  onClose,
  defaultEnvironment,
}: {
  node: SystemId;
  open: boolean;
  onClose: () => void;
  defaultEnvironment: string;
}) {
  const metricsAvailable = Boolean(renderResourceName(node));
  const [tab, setTab] = useState<"metrics" | "logs" | "errors">(
    metricsAvailable ? "metrics" : "logs",
  );
  const [filters, setFilters] = useState(() =>
    telemetryQuerySchema.parse({ node, environment: defaultEnvironment }),
  );
  const [search, setSearch] = useState("");
  const fetcher = useFetcher<TelemetryResponse>();
  const { load } = fetcher;
  const supported = hasTelemetry(node);
  const key = telemetryQueryKey(filters);
  const url = `/control/telemetry?${key}`;
  useEffect(() => {
    if (open && supported && tab !== "metrics") void load(url);
  }, [open, supported, tab, load, url]);
  const result = fetcher.data?.key === key || fetcher.data?.key === "" ? fetcher.data : undefined;
  const loading = supported && (fetcher.state !== "idle" || !result);
  const update = (values: Partial<TelemetryQuery>) =>
    setFilters((current) => ({ ...current, ...values, cursor: "" }));
  const environments = [
    ...new Set([defaultEnvironment, filters.environment, ...(fetcher.data?.environments ?? [])]),
  ]
    .filter(Boolean)
    .sort();
  return (
    <Drawer open={open} onClose={onClose}>
      <div className="shrink-0 border-b border-zinc-950/10 px-6 pt-6 dark:border-white/10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <DialogTitle>{site.systems[node].name}</DialogTitle>
            <Text className="mt-1">{site.systems[node].description}</Text>
          </div>
          <Button plain onClick={onClose} aria-label="Close panel">
            <XMarkIcon />
          </Button>
        </div>
        <Navbar className="mt-3" aria-label="Service details">
          <NavbarSection>
            {metricsAvailable && (
              <NavbarItem current={tab === "metrics"} onClick={() => setTab("metrics")}>
                Metrics
              </NavbarItem>
            )}
            {(["logs", "errors"] as const).map((telemetryTab) => (
              <NavbarItem
                key={telemetryTab}
                current={tab === telemetryTab}
                onClick={() => {
                  setTab(telemetryTab);
                  update({ tab: telemetryTab });
                }}
              >
                {telemetryTab === "logs" ? "Logs" : "Errors"}
              </NavbarItem>
            ))}
          </NavbarSection>
        </Navbar>
      </div>
      {supported && tab !== "metrics" && (
        <div className="shrink-0 space-y-4 border-b border-zinc-950/10 p-6 dark:border-white/10">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const q = search.trim();
              if (q === filters.q) void load(url);
              else update({ q });
            }}
          >
            <Input
              aria-label={filters.tab === "logs" ? "Search log messages" : "Search errors"}
              placeholder={filters.tab === "logs" ? "Search log messages…" : "Search errors…"}
              value={search}
              maxLength={200}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button type="submit" outline aria-label="Search">
              <MagnifyingGlassIcon />
            </Button>
            <Button
              type="button"
              outline
              aria-label="Refresh"
              disabled={loading}
              onClick={() => {
                void load(url);
              }}
            >
              <ArrowPathIcon />
            </Button>
          </form>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field>
              <Label>Time range</Label>
              <Select
                value={filters.period}
                onChange={(event) =>
                  update({ period: event.target.value as TelemetryQuery["period"] })
                }
              >
                <option value="1h">Last hour</option>
                <option value="24h">Last 24 hours</option>
                <option value="7d">Last 7 days</option>
              </Select>
            </Field>
            <Field>
              <Label>Environment</Label>
              <Select
                value={filters.environment}
                onChange={(event) => update({ environment: event.target.value })}
              >
                <option value="">All</option>
                {environments.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>
            {node === "web" && (
              <Field>
                <Label>Source</Label>
                <Select
                  value={filters.source}
                  onChange={(event) =>
                    update({ source: event.target.value as TelemetryQuery["source"] })
                  }
                >
                  <option value="all">All</option>
                  <option value="web">Server</option>
                  <option value="browser">Browser</option>
                </Select>
              </Field>
            )}
            {filters.tab === "logs" ? (
              <Field>
                <Label>Severity</Label>
                <Select
                  value={filters.severity}
                  onChange={(event) =>
                    update({ severity: event.target.value as TelemetryQuery["severity"] })
                  }
                >
                  {(["all", "debug", "info", "warning", "error", "fatal"] as const).map((level) => (
                    <option key={level} value={level}>
                      {level[0].toUpperCase() + level.slice(1)}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field>
                <Label>Status</Label>
                <Select
                  value={filters.status}
                  onChange={(event) =>
                    update({ status: event.target.value as TelemetryQuery["status"] })
                  }
                >
                  {(["all", "unresolved", "resolved", "archived"] as const).map((status) => (
                    <option key={status} value={status}>
                      {status[0].toUpperCase() + status.slice(1)}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-6" aria-busy={tab !== "metrics" && loading}>
        {tab === "metrics" ? (
          <ServiceMetrics node={node} active={open} />
        ) : !supported ? (
          <Text className="py-8">No {filters.tab} available.</Text>
        ) : loading ? (
          <Text className="py-8" role="status">
            Loading {filters.tab}…
          </Text>
        ) : result?.state === "unconfigured" || result?.state === "error" ? (
          <Text className="py-8" role="status">
            {result.message}
          </Text>
        ) : filters.tab === "logs" ? (
          result?.logs.length ? (
            result.logs.map((log) => <LogRow key={log.id} log={log} />)
          ) : (
            <Text className="py-8">No logs found for these filters.</Text>
          )
        ) : result?.issues.length ? (
          result.issues.map((issue) => <IssueRow key={issue.id} issue={issue} />)
        ) : (
          <Text className="py-8">No errors found for these filters.</Text>
        )}
      </div>
      {tab !== "metrics" && supported && result?.state === "ready" && (
        <div className="flex shrink-0 items-center justify-between border-t border-zinc-950/10 p-6 dark:border-white/10">
          <Button
            outline
            disabled={loading || !result.previous}
            onClick={() => setFilters((current) => ({ ...current, cursor: result.previous ?? "" }))}
          >
            Previous
          </Button>
          <Button
            outline
            disabled={loading || !result.next}
            onClick={() => setFilters((current) => ({ ...current, cursor: result.next ?? "" }))}
          >
            Next
          </Button>
        </div>
      )}
    </Drawer>
  );
}
