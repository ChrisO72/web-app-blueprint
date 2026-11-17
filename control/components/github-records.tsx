import { Link } from "react-router";
import type { listRecords } from "~/control/db/repositories/github.server";
import { Heading } from "~/web/components/ui-kit/heading";
import { Text, TextLink } from "~/web/components/ui-kit/text";
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
                    <TableRow key={record.githubId}>
                      <TableCell className="min-w-64 whitespace-normal">
                        <TextLink href={record.url} target="_blank" rel="noreferrer">
                          #{record.number} {record.title}
                        </TextLink>
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
    </div>
  );
}
