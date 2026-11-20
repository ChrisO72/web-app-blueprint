import clsx from "clsx";
import { Fragment, useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { useFetcher } from "react-router";
import { ArrowPathIcon, ChevronDownIcon, MagnifyingGlassIcon } from "@heroicons/react/16/solid";
import { site, type SystemId } from "~/system.config";
import { DetailsPanel, DetailsFields } from "~/web/components/details-panel";
import { Button } from "~/web/components/ui-kit/button";
import { Field, Label } from "~/web/components/ui-kit/fieldset";
import { Subheading } from "~/web/components/ui-kit/heading";
import { Input, InputGroup } from "~/web/components/ui-kit/input";
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

import type { ModuleType } from "../module-types.server";
import { renderResourceName } from "../render";
import { ServiceMetrics } from "./service-metrics";
import { systemKinds } from "./system-kind";
import { SyntaxCode } from "./syntax-code";

const date = (value: string) => new Date(value).toLocaleString();

const severityColors: Record<string, ComponentProps<typeof Badge>["color"]> = {
  info: "blue",
  warn: "amber",
  warning: "amber",
  error: "red",
  fatal: "red",
};

function TelemetryRow({
  title,
  metadata,
  children,
}: {
  title: string;
  metadata: ReactNode;
  children?: ReactNode;
}) {
  return (
    <details className="group border-b border-zinc-950/5 last:border-0 dark:border-white/5">
      <summary className="flex cursor-pointer list-none items-start gap-3 rounded-lg px-3 py-2.5 text-sm outline-offset-[-2px] hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-white/5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-zinc-950 group-open:wrap-anywhere group-open:whitespace-pre-wrap dark:text-white">
            {title}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
            {metadata}
          </span>
        </span>
        <ChevronDownIcon
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-zinc-500 group-open:rotate-180"
        />
      </summary>
      {children && <div className="px-3 pt-1 pb-3">{children}</div>}
    </details>
  );
}

function LogRow({ log }: { log: TelemetryLog }) {
  const color = Object.hasOwn(severityColors, log.severity) ? severityColors[log.severity] : "zinc";
  return (
    <TelemetryRow
      title={log.message || "(No message)"}
      metadata={
        <>
          <Badge color={color} className="rounded-full! px-2! capitalize">
            {log.severity}
          </Badge>
          <span>
            {log.service === "web" ? "Server" : log.service === "browser" ? "Browser" : "Worker"}
          </span>
          <time dateTime={log.timestamp}>{date(log.timestamp)}</time>
        </>
      }
    >
      {log.context.length > 0 && (
        <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1.5 rounded-lg bg-zinc-50 p-3 text-xs dark:bg-white/5">
          {log.context.map(({ label, value }) => (
            <div key={label} className="contents">
              <dt className="wrap-anywhere text-zinc-500 dark:text-zinc-400">{label}</dt>
              <dd className="wrap-anywhere text-zinc-700 dark:text-zinc-300">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </TelemetryRow>
  );
}

function IssueRow({ issue }: { issue: TelemetryIssue }) {
  const color =
    issue.status === "resolved" ? "green" : issue.status === "unresolved" ? "amber" : "zinc";
  return (
    <TelemetryRow
      title={issue.title}
      metadata={
        <>
          <Badge color={color} className="rounded-full! px-2! capitalize">
            {issue.status}
          </Badge>
          {issue.count !== undefined && (
            <span>
              {issue.count} {issue.count === "1" ? "occurrence" : "occurrences"}
            </span>
          )}
          {issue.lastSeen && (
            <time dateTime={issue.lastSeen}>Last seen {date(issue.lastSeen)}</time>
          )}
        </>
      }
    >
      {(issue.culprit || issue.firstSeen || issue.url) && (
        <div className="space-y-1.5 rounded-lg bg-zinc-50 p-3 text-sm dark:bg-white/5">
          {issue.culprit && <Text className="wrap-anywhere">{issue.culprit}</Text>}
          {issue.firstSeen && (
            <Text>
              First seen <time dateTime={issue.firstSeen}>{date(issue.firstSeen)}</time>
            </Text>
          )}
          {issue.url && (
            <TextLink href={issue.url} target="_blank" rel="noreferrer">
              Open in Sentry ↗
            </TextLink>
          )}
        </div>
      )}
    </TelemetryRow>
  );
}

function ModuleDefinition({ type }: { type: ModuleType }) {
  if ("definition" in type) {
    return <SyntaxCode language="typescript">{type.definition}</SyntaxCode>;
  }

  return (
    <code className="control-code">
      {type.fields.map(({ name, sqlType, nullable, enumValues }, index) => (
        <Fragment key={name}>
          {index > 0 && "\n"}
          <span className="hljs-attr">{name}</span>
          {": "}
          {enumValues?.length ? (
            <span className="hljs-string">
              {enumValues.map((value) => JSON.stringify(value)).join(" | ")}
            </span>
          ) : (
            <span className="hljs-type">{sqlType}</span>
          )}
          {nullable && (
            <>
              {" | "}
              <span className="hljs-literal">null</span>
            </>
          )}
        </Fragment>
      ))}
    </code>
  );
}

const telemetryTabs = [
  { id: "logs", label: "Logs" },
  { id: "errors", label: "Errors" },
  { id: "details", label: "Details" },
] as const;

export function ServicePanel({
  node,
  types,
  open,
  onClose,
  defaultEnvironment,
}: {
  node: SystemId;
  types?: readonly ModuleType[];
  open: boolean;
  onClose: () => void;
  defaultEnvironment: string;
}) {
  const system = site.systems[node];
  const kind = systemKinds[system.kind];
  const supported = hasTelemetry(node);
  const [tab, setTab] = useState<(typeof telemetryTabs)[number]["id"]>(
    supported ? "logs" : "details",
  );
  const [filters, setFilters] = useState(() =>
    telemetryQuerySchema.parse({ node, environment: defaultEnvironment }),
  );
  const [search, setSearch] = useState("");
  const fetcher = useFetcher<TelemetryResponse>();
  const { load } = fetcher;
  const telemetryActive = tab === "logs" || tab === "errors";
  const key = telemetryQueryKey(filters);
  const url = `/control/telemetry?${key}`;
  useEffect(() => {
    if (open && supported && telemetryActive) void load(url);
  }, [open, supported, telemetryActive, load, url]);
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
    <DetailsPanel
      open={open}
      onClose={onClose}
      title={system.name}
      description={system.description}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-6">
        {renderResourceName(node) && <ServiceMetrics node={node} open={open} />}
        {supported && (
          <div
            role="group"
            aria-label="Service views"
            className="mt-3 inline-flex rounded-xl bg-zinc-100 p-1 dark:bg-white/5"
          >
            {telemetryTabs.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                aria-pressed={tab === id}
                className={clsx(
                  "rounded-lg px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-blue-500",
                  tab === id
                    ? "bg-white text-zinc-950 shadow-xs dark:bg-white/10 dark:text-white"
                    : "cursor-pointer text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white",
                )}
                onClick={() => {
                  if (tab === id) return;
                  setTab(id);
                  if (id !== "details" && filters.tab !== id) update({ tab: id });
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {supported && telemetryActive && (
          <div className="space-y-3 border-b border-zinc-950/10 py-3 dark:border-white/10">
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const q = search.trim();
                if (q === filters.q) void load(url);
                else update({ q });
              }}
            >
              <div className="min-w-0 flex-1">
                <InputGroup>
                  <MagnifyingGlassIcon data-slot="icon" aria-hidden="true" />
                  <Input
                    type="search"
                    aria-label={filters.tab === "logs" ? "Search log messages" : "Search errors"}
                    placeholder={filters.tab === "logs" ? "Search log messages…" : "Search errors…"}
                    value={search}
                    maxLength={200}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </InputGroup>
              </div>
              <Button type="submit" outline>
                Search
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
                <ArrowPathIcon data-slot="icon" />
              </Button>
            </form>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
                    {(["all", "debug", "info", "warning", "error", "fatal"] as const).map(
                      (level) => (
                        <option key={level} value={level}>
                          {level[0].toUpperCase() + level.slice(1)}
                        </option>
                      ),
                    )}
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
        <div className="py-2" aria-busy={telemetryActive && loading}>
          {tab === "details" ? (
            <div className="space-y-6 py-6">
              <DetailsFields
                fields={[
                  {
                    label: "Type",
                    value: (
                      <Badge className="rounded-full! px-2!">
                        <span
                          aria-hidden="true"
                          className={`size-1.5 rounded-full bg-current ${kind.color}`}
                        />
                        {kind.label}
                      </Badge>
                    ),
                  },
                  { label: "Source", value: <code>{system.source}</code> },
                  {
                    label: "Connects to",
                    value:
                      site.connections
                        .filter(([from]) => from === node)
                        .map(([, to]) => site.systems[to].name)
                        .join(", ") || "None",
                  },
                  {
                    label: "Connected from",
                    value:
                      site.connections
                        .filter(([, to]) => to === node)
                        .map(([from]) => site.systems[from].name)
                        .join(", ") || "None",
                  },
                ]}
              />
              {types && types.length > 0 && (
                <section className="space-y-2">
                  <Subheading>Types</Subheading>
                  {types.map((type, index) => (
                    <details
                      key={type.name}
                      open={index === 0}
                      className="group rounded-lg border border-zinc-950/10 dark:border-white/10"
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-950 outline-offset-[-2px] hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-white dark:hover:bg-white/5 [&::-webkit-details-marker]:hidden">
                        <span className="wrap-anywhere">{type.name}</span>
                        <ChevronDownIcon
                          aria-hidden="true"
                          className="size-4 shrink-0 text-zinc-500 group-open:rotate-180"
                        />
                      </summary>
                      <div className="space-y-2 px-3 pb-3">
                        <code className="block text-xs wrap-anywhere text-zinc-600 dark:text-zinc-400">
                          {type.source}
                        </code>
                        <pre className="rounded-md bg-zinc-50 p-3 text-xs/5 wrap-anywhere whitespace-pre-wrap text-zinc-900 dark:bg-white/5 dark:text-zinc-200">
                          <ModuleDefinition type={type} />
                        </pre>
                      </div>
                    </details>
                  ))}
                </section>
              )}
            </div>
          ) : !result ? (
            <Text className="py-8" role="status">
              Loading {filters.tab}…
            </Text>
          ) : result.state === "unconfigured" || result.state === "error" ? (
            <Text className="py-8" role="status">
              {result.message}
            </Text>
          ) : filters.tab === "logs" ? (
            result.logs.length ? (
              result.logs.map((log) => <LogRow key={log.id} log={log} />)
            ) : (
              <Text className="py-8">No logs found for these filters.</Text>
            )
          ) : result.issues.length ? (
            result.issues.map((issue) => <IssueRow key={issue.id} issue={issue} />)
          ) : (
            <Text className="py-8">No errors found for these filters.</Text>
          )}
        </div>
      </div>
      {telemetryActive &&
        supported &&
        result?.state === "ready" &&
        (result.previous || result.next) && (
          <div className="flex shrink-0 items-center justify-between border-t border-zinc-950/10 px-4 py-3 sm:px-6 dark:border-white/10">
            <Button
              outline
              disabled={loading || !result.previous}
              onClick={() =>
                setFilters((current) => ({ ...current, cursor: result.previous ?? "" }))
              }
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
    </DetailsPanel>
  );
}
