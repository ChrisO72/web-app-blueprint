import { useEffect } from "react";
import { Link, useFetcher } from "react-router";
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
import { recordPageSizeOptions } from "~/control/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/web/components/ui-kit/table";

type Props = Awaited<ReturnType<typeof listRecords>> & { title: string; base: string };
export function GitHubRecords({
  title,
  base,
  connection,
  records,
  page,
  totalPages,
  totalCount,
  pageSize,
}: Props) {
  const { selected, open, select, close } = useDetailsSelection<Props["records"][number]>(
    records,
    (record) => record.githubId,
  );
  const kind = base.endsWith("actions") ? "run" : base.endsWith("prs") ? "pull" : "issue";
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
            ({totalCount} total)
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
          {records.length ? (
            <div className="mt-6 min-h-0 min-w-0 flex-1 overflow-auto">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Title</TableHeader>
                    <TableHeader>Status</TableHeader>
                    <TableHeader>{base.endsWith("actions") ? "Branch" : "Labels"}</TableHeader>
                    <TableHeader>Updated</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {records.map((record) => (
                    <TableRow
                      key={record.githubId}
                      onOpen={() => select(record)}
                      title={`View #${record.number} ${record.title}`}
                    >
                      <TableCell className="min-w-64 whitespace-normal">
                        <span className="font-medium">
                          #{record.number} {record.title}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge color="zinc">
                          {record.mergedAt
                            ? "merged"
                            : record.draft && record.state === "open"
                              ? "draft"
                              : (record.conclusion ?? record.state)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {base.endsWith("actions") ? (
                          (record.branch ?? "—")
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {record.labels.map((label) => (
                              <Badge key={label.id} color="zinc">
                                {label.name}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{new Date(record.updatedAt).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <Text className="mt-6">No records yet.</Text>
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
                  value: selected.mergedAt
                    ? "merged"
                    : selected.draft && selected.state === "open"
                      ? "draft"
                      : (selected.conclusion ?? selected.state),
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
