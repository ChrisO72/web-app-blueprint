import { MagnifyingGlassIcon } from "@heroicons/react/16/solid";
import { useEffect, type ComponentProps } from "react";
import { Form, Link, useFetcher } from "react-router";
import type { RecordKind } from "~/integrations/github/records";
import { DetailsPanel, DetailsPanelBody, DetailsFields } from "~/web/components/details-panel";
import { Button } from "~/web/components/ui-kit/button";
import { Subheading } from "~/web/components/ui-kit/heading";
import { useDetailsSelection } from "~/web/lib/use-details-selection";
import type { loader as recordLoader } from "~/web/routes/control/record";
import type { listRecords } from "~/control/db/repositories/github.server";
import { Heading } from "~/web/components/ui-kit/heading";
import { Text } from "~/web/components/ui-kit/text";
import { Badge } from "~/web/components/ui-kit/badge";
import { Pagination } from "~/web/routes/items/Pagination";
import { recordFilterTextLimit, recordPageSizeOptions, recordStatuses } from "~/control/pagination";
import { Input, InputGroup } from "~/web/components/ui-kit/input";
import { Select } from "~/web/components/ui-kit/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/web/components/ui-kit/table";

type Props = Awaited<ReturnType<typeof listRecords>> & {
  title: string;
  base: string;
  kind: RecordKind;
};

type GitHubRecord = Props["records"][number];

const statusColors: Record<string, ComponentProps<typeof Badge>["color"]> = {
  open: "green",
  merged: "purple",
  success: "green",
  failure: "red",
  timed_out: "red",
  startup_failure: "red",
  in_progress: "blue",
  action_required: "amber",
  waiting: "amber",
};

const updatedDate = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

function readableValue(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function RecordFilters({ base, kind, query }: Pick<Props, "base" | "kind" | "query">) {
  const { q, status, scope, pageSize } = query;
  const scopeLabel = kind === "run" ? "Branch" : kind === "pull" ? "Label or branch" : "Label";
  const resetUrl = `${base}?pageSize=${pageSize}`;
  return (
    <Form method="get" action={base} className="mt-5 flex shrink-0 flex-wrap items-center gap-2">
      <input type="hidden" name="pageSize" value={pageSize} />
      <div className="min-w-48 flex-1">
        <InputGroup>
          <MagnifyingGlassIcon data-slot="icon" aria-hidden="true" />
          <Input
            key={q}
            type="search"
            name="q"
            defaultValue={q}
            maxLength={recordFilterTextLimit}
            aria-label="Search by title or number"
            placeholder="Search by title or #"
          />
        </InputGroup>
      </div>
      <Select
        key={`status:${status}`}
        className="w-auto!"
        name="status"
        defaultValue={status}
        aria-label="Status"
      >
        <option value="">All statuses</option>
        {Object.entries(recordStatuses[kind]).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>
      <Input
        key={`scope:${scope}`}
        className="w-auto! min-w-0"
        type="search"
        name="scope"
        defaultValue={scope}
        maxLength={recordFilterTextLimit}
        aria-label={scopeLabel}
        placeholder={scopeLabel}
      />
      <Button type="submit" outline>
        Apply
      </Button>
      {(q || status || scope) && (
        <Button href={resetUrl} plain>
          Clear filters
        </Button>
      )}
    </Form>
  );
}

function RecordLabels({ labels }: { labels: GitHubRecord["labels"] }) {
  if (!labels.length) return <span className="text-zinc-500 dark:text-zinc-400">—</span>;
  return (
    <div className="flex max-w-72 min-w-32 flex-wrap gap-1.5 whitespace-normal">
      {labels.map((label) => (
        <Badge key={label.id} className="rounded-full! px-2!">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full bg-zinc-400 ring-1 ring-black/10 dark:ring-white/20"
            style={
              /^[0-9a-f]{6}$/i.test(label.color)
                ? { backgroundColor: `#${label.color}` }
                : undefined
            }
          />
          <span className="wrap-anywhere">{label.name}</span>
        </Badge>
      ))}
    </div>
  );
}

export function GitHubRecords({
  title,
  base,
  kind,
  query,
  connection,
  records,
  page,
  totalPages,
  totalCount,
  pageSize,
}: Props) {
  const { selected, open, select, close } = useDetailsSelection<GitHubRecord>(
    records,
    (record) => record.githubId,
  );
  const hasFilters = Boolean(query.q || query.status || query.scope);
  const statuses: Record<string, string> = recordStatuses[kind];
  const statusLabel = (status: string) =>
    Object.hasOwn(statuses, status) ? statuses[status] : readableValue(status);
  const fetcher = useFetcher<typeof recordLoader>();
  const { load } = fetcher;
  const githubId = selected?.githubId;
  const detailUrl = githubId ? `/control/record?kind=${kind}&githubId=${githubId}` : null;
  useEffect(() => {
    if (open && detailUrl) void load(detailUrl);
  }, [open, detailUrl, load]);
  const result = fetcher.data?.key === `${kind}:${githubId}` ? fetcher.data : undefined;
  const detail = result?.record;
  const loading = fetcher.state !== "idle" || !result;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <Heading className="shrink-0">
        {title}
        {totalCount > 0 && (
          <span className="ml-2 font-normal text-zinc-500 dark:text-zinc-400">
            ({totalCount} {hasFilters ? "matching" : "total"})
          </span>
        )}
      </Heading>
      {!connection?.repositoryId ? (
        <Text className="mt-4 shrink-0">
          Connect a repository in{" "}
          <Link to="/control/settings" className="underline">
            Settings
          </Link>
          .
        </Text>
      ) : (
        <>
          <Text className="mt-2 shrink-0 break-words">
            {connection.owner}/{connection.name} · GitHub is the source of truth
          </Text>
          {connection.status !== "connected" && (
            <Text className="mt-2 shrink-0 break-words">
              Sync status: {connection.status}.{" "}
              <Link to="/control/settings" className="underline">
                View connection
              </Link>
            </Text>
          )}
          <RecordFilters base={base} kind={kind} query={query} />
          {records.length ? (
            <div className="mt-4 min-h-0 min-w-0 overflow-auto rounded-xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/2.5">
              <Table bleed dense className="mx-0! [--gutter:--spacing(4)]">
                <TableHead>
                  <TableRow>
                    <TableHeader scope="col">{kind === "run" ? "Run" : "Title"}</TableHeader>
                    <TableHeader scope="col">Status</TableHeader>
                    <TableHeader scope="col">{kind === "run" ? "Branch" : "Labels"}</TableHeader>
                    <TableHeader scope="col">Updated</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {records.map((record) => {
                    const metadata = [
                      `#${record.number}`,
                      record.author && `@${record.author.login}`,
                      record.workflow,
                      record.event && readableValue(record.event),
                      record.attempt && record.attempt > 1 && `Attempt ${record.attempt}`,
                    ].filter(Boolean);
                    const updatedAt = new Date(record.updatedAt);
                    return (
                      <TableRow
                        key={record.githubId}
                        onOpen={() => select(record)}
                        title={`View #${record.number} ${record.title}`}
                      >
                        <TableCell className="w-full min-w-64 whitespace-normal">
                          <div className="font-medium wrap-anywhere">{record.title}</div>
                          <div className="text-xs/5 wrap-anywhere text-zinc-500 dark:text-zinc-400">
                            {metadata.join(" · ")}
                          </div>
                          {record.branch && record.baseBranch && (
                            <div className="text-xs/5 wrap-anywhere text-zinc-500 dark:text-zinc-400">
                              {record.branch} → {record.baseBranch}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            color={
                              Object.hasOwn(statusColors, record.status)
                                ? statusColors[record.status]
                                : "zinc"
                            }
                            className="rounded-full! px-2!"
                          >
                            {statusLabel(record.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {kind === "run" ? (
                            <span className="block max-w-48 min-w-24 text-sm wrap-anywhere whitespace-normal text-zinc-600 dark:text-zinc-300">
                              {record.branch ?? "—"}
                            </span>
                          ) : (
                            <RecordLabels labels={record.labels} />
                          )}
                        </TableCell>
                        <TableCell className="text-zinc-500 tabular-nums dark:text-zinc-400">
                          <time dateTime={updatedAt.toISOString()} title={updatedAt.toUTCString()}>
                            {updatedDate.format(updatedAt)}
                          </time>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <Text className="mt-6" role="status">
              {hasFilters ? "No records match these filters." : "No records yet."}
            </Text>
          )}
          {totalCount > 0 && (
            <div className="shrink-0 overflow-x-auto">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                totalCount={totalCount}
                limit={pageSize}
                pageSizeOptions={recordPageSizeOptions}
              />
            </div>
          )}
        </>
      )}
      <DetailsPanel
        open={open}
        onClose={close}
        title={selected ? `#${selected.number} ${selected.title}` : "Details"}
        description={`${connection?.owner}/${connection?.name} · ${kind === "run" ? "Workflow run" : kind === "pull" ? "Pull request" : "Issue"}`}
        actions={
          selected && (
            <Button href={selected.url} target="_blank" rel="noreferrer">
              Open in GitHub ↗
            </Button>
          )
        }
      >
        <DetailsPanelBody>
          {selected && (
            <DetailsFields
              fields={[
                {
                  label: "Status",
                  value: statusLabel(selected.status),
                },
                { label: "Updated", value: new Date(selected.updatedAt).toLocaleString() },
                { label: "Branch", value: selected.branch },
                {
                  label: "Labels",
                  value: selected.labels.length
                    ? selected.labels.map((label) => label.name).join(", ")
                    : "None",
                },
              ]}
            />
          )}
          <div aria-busy={loading}>
            {loading ? (
              <Text role="status">Loading details…</Text>
            ) : !detail ? (
              <div className="space-y-3" role="status">
                <Text>{result?.message}</Text>
                <Button
                  outline
                  onClick={() => {
                    if (detailUrl) void load(detailUrl);
                  }}
                >
                  Try again
                </Button>
              </div>
            ) : (
              <>
                <DetailsFields
                  fields={[
                    { label: "Created", value: new Date(detail.createdAt).toLocaleString() },
                    { label: "Synced", value: new Date(detail.syncedAt).toLocaleString() },
                    ...(detail.kind === "run"
                      ? [
                          { label: "Workflow", value: detail.workflow },
                          { label: "Event", value: detail.event },
                          { label: "Commit", value: detail.commitSha },
                          { label: "Attempt", value: detail.runAttempt },
                          {
                            label: "Started",
                            value: detail.startedAt
                              ? new Date(detail.startedAt).toLocaleString()
                              : null,
                          },
                        ]
                      : [
                          { label: "Author", value: detail.author?.login },
                          {
                            label: "Assignees",
                            value:
                              detail.assignees.map((user) => user.login).join(", ") || "Unassigned",
                          },
                          { label: "State reason", value: detail.stateReason },
                          {
                            label: "Closed",
                            value: detail.closedAt
                              ? new Date(detail.closedAt).toLocaleString()
                              : null,
                          },
                          ...(detail.kind === "pull"
                            ? [
                                { label: "Head branch", value: detail.headBranch },
                                { label: "Base branch", value: detail.baseBranch },
                                {
                                  label: "Merged",
                                  value: detail.mergedAt
                                    ? new Date(detail.mergedAt).toLocaleString()
                                    : null,
                                },
                              ]
                            : []),
                        ]),
                  ]}
                />
                {detail.kind !== "run" && (
                  <section className="mt-6 space-y-3">
                    <Subheading>Description</Subheading>
                    <Text className="wrap-anywhere whitespace-pre-wrap">
                      {detail.description || "No description."}
                    </Text>
                  </section>
                )}
              </>
            )}
          </div>
        </DetailsPanelBody>
      </DetailsPanel>
    </div>
  );
}
