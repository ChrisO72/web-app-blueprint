import { finishRunnerTask, pollRunner } from "~/control/db/repositories/runner.server";
import { runnerRequest } from "~/control/runner-protocol";
import { authorizedRunnerOrganization } from "./runner-auth.server";
import type { Route } from "./+types/runner";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const organizationId = authorizedRunnerOrganization(request);
  if (organizationId === undefined) return new Response(null, { status: 401 });

  const parsed = runnerRequest.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return new Response(null, { status: 400 });

  if (parsed.data.action === "poll") {
    const result = await pollRunner(organizationId, parsed.data);
    return result
      ? Response.json(result, { headers: { "Cache-Control": "no-store" } })
      : new Response(null, { status: 409 });
  }
  const finished = await finishRunnerTask(organizationId, parsed.data);
  return new Response(null, { status: finished ? 204 : 409 });
}
