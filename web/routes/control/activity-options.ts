import { listTaskTargets } from "~/control/db/repositories/tasks.server";
import { loadRepositorySkills } from "~/control/docs.server";
import { publicError } from "~/control/github.server";
import { taskTargetSearch } from "~/control/tasks";
import { requireAdmin } from "~/web/lib/session.server";
import type { Route } from "./+types/activity-options";

export async function loader({ context, request }: Route.LoaderArgs) {
  requireAdmin(context);
  const params = new URL(request.url).searchParams;
  if (params.get("kind") === "skills") {
    try {
      const { connectionId, skills } = await loadRepositorySkills();
      return { kind: "skills", connectionId, skills, error: null } as const;
    } catch (error) {
      return { kind: "skills", error: publicError(error) } as const;
    }
  }
  const query = taskTargetSearch.parse(params.get("q"));
  try {
    const result = await listTaskTargets(query);
    if (!result) return { kind: "targets", query, disconnected: true } as const;
    return { kind: "targets", query, ...result, error: null } as const;
  } catch {
    return { kind: "targets", query, error: "Could not load GitHub records." } as const;
  }
}

export function shouldRevalidate() {
  // Each dialog loads these options explicitly, independent of history revalidation.
  return false;
}
