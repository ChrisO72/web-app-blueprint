import { parseRecordQuery } from "~/control/pagination";
import { requireAdmin } from "~/web/lib/session.server";
import { listRecords } from "~/control/db/repositories/github.server";
import { GitHubRecords } from "~/control/components/github-records";
import type { Route } from "./+types/issues";

export async function loader({ context, request }: Route.LoaderArgs) {
  requireAdmin(context);
  const query = parseRecordQuery("issue", new URL(request.url).searchParams);
  return listRecords("issue", query);
}
export function meta() {
  return [{ title: "Issues · Control" }];
}
export default function Page({ loaderData }: Route.ComponentProps) {
  return <GitHubRecords {...loaderData} title="Issues" base="/control/issues" kind="issue" />;
}
