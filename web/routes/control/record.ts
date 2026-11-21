import { z } from "zod";
import { getRecordDetails } from "~/control/db/repositories/github.server";
import { requireAdmin } from "~/web/lib/session.server";
import { log } from "~/telemetry/log.server";
import type { Route } from "./+types/record";

const querySchema = z.object({
  kind: z.enum(["issue", "pull", "run"]),
  githubId: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export async function loader({ context, request }: Route.LoaderArgs) {
  requireAdmin(context);
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return { key: "", record: null, message: "Invalid record." };
  const { kind, githubId } = query.data;
  const key = `${kind}:${githubId}`;
  try {
    const record = await getRecordDetails(kind, githubId);
    return { key, record, message: record ? null : "This record is no longer available." };
  } catch (error) {
    log.error("Control record details failed", error, { kind, githubId });
    return { key, record: null, message: "Details could not be loaded. Please try again." };
  }
}
