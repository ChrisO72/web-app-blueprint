import { Link } from "react-router";
import type { listRecords } from "~/control/db/repositories/github.server";
import { Heading } from "~/web/components/ui-kit/heading";
import { Text, TextLink } from "~/web/components/ui-kit/text";
import { Badge } from "~/web/components/ui-kit/badge";
import { Button } from "~/web/components/ui-kit/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/web/components/ui-kit/table";

type Props = Awaited<ReturnType<typeof listRecords>> & { title: string; base: string };
export function GitHubRecords({ title, base, connection, records, page, pages }: Props) {
  return (
    <>
      <Heading>{title}</Heading>
      {!connection?.repositoryId ? (
        <Text className="mt-4">
          Connect a repository in{" "}
          <Link to="/control/settings" className="underline">
            Settings
          </Link>
          .
        </Text>
      ) : (
        <>
          <Text className="mt-2">
            {connection.owner}/{connection.name} · GitHub is the source of truth
          </Text>
          {connection.status !== "connected" && (
            <Text className="mt-2">
              Sync status: {connection.status}.{" "}
              <Link to="/control/settings" className="underline">
                View connection
              </Link>
            </Text>
          )}
          {records.length ? (
            <div className="mt-6 overflow-x-auto">
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
          <div className="mt-6 flex items-center gap-4">
            {page > 1 ? (
              <Button outline href={`${base}?page=${page - 1}`}>
                Previous
              </Button>
            ) : (
              <Button outline disabled>
                Previous
              </Button>
            )}
            <Text>
              Page {page} of {pages}
            </Text>
            {page < pages ? (
              <Button outline href={`${base}?page=${page + 1}`}>
                Next
              </Button>
            ) : (
              <Button outline disabled>
                Next
              </Button>
            )}
          </div>
        </>
      )}
    </>
  );
}
