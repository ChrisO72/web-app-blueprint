import { data } from "react-router";
import { z } from "zod";
import { getTaskProgress } from "~/control/db/repositories/tasks.server";
import { requireAdmin } from "~/web/lib/session.server";
import type { Route } from "./+types/activity-output";

const noStore = { headers: { "Cache-Control": "no-store" } };

export async function loader({ context, request }: Route.LoaderArgs) {
  const { user } = requireAdmin(context);
  const taskId = z.uuid().safeParse(new URL(request.url).searchParams.get("taskId"));
  if (!taskId.success) return data({ taskId: null, progress: null, error: false }, noStore);
  try {
    const progress = await getTaskProgress(user.organizationId, taskId.data);
    return data({ taskId: taskId.data, progress, error: false }, noStore);
  } catch {
    return data({ taskId: taskId.data, progress: null, error: true }, noStore);
  }
}
