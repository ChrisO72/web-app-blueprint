import { z } from "zod";
import { requireAdmin } from "~/web/lib/session.server";
import { listRecords } from "~/control/db/repositories/github.server";
import { GitHubRecords } from "~/control/components/github-records";
import type { Route } from "./+types/actions";

export async function loader({ context, request }: Route.LoaderArgs) {
  requireAdmin(context);
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(1_000_000)
    .catch(1)
    .parse(new URL(request.url).searchParams.get("page") ?? 1);
  return listRecords("run", page);
}
export function meta() {
  return [{ title: "Actions · Control" }];
}
export default function Page({ loaderData }: Route.ComponentProps) {
  return <GitHubRecords {...loaderData} title="Actions" base="/control/actions" />;
}
