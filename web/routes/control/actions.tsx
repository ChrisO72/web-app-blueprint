import { parseRecordPagination } from "~/control/pagination";
import { requireAdmin } from "~/web/lib/session.server";
import { listRecords } from "~/control/db/repositories/github.server";
import { GitHubRecords } from "~/control/components/github-records";
import type { Route } from "./+types/actions";

export async function loader({ context, request }: Route.LoaderArgs) {
  requireAdmin(context);
  const { page, pageSize } = parseRecordPagination(new URL(request.url).searchParams);
  return listRecords("run", page, pageSize);
}
export function meta() {
  return [{ title: "Actions · Control" }];
}
export default function Page({ loaderData }: Route.ComponentProps) {
  return <GitHubRecords {...loaderData} title="Actions" base="/control/actions" />;
}
