import { data } from "react-router";
import type { Route } from "./+types/telemetry";
import { requireAdmin } from "~/web/lib/session.server";
import { readServiceTelemetry } from "~/control/sentry.server";
import { telemetryQueryKey, telemetryQuerySchema } from "~/control/telemetry";

export async function loader({ request, context }: Route.LoaderArgs) {
  requireAdmin(context);
  const parsed = telemetryQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  const headers = { "Cache-Control": "no-store" };
  if (!parsed.success) {
    return data(
      {
        key: "",
        state: "error" as const,
        message: "Invalid telemetry filters.",
        logs: [],
        issues: [],
        environments: [],
      },
      { status: 400, headers },
    );
  }
  const result = await readServiceTelemetry(parsed.data, request.signal);
  return data({ ...result, key: telemetryQueryKey(parsed.data) }, { headers });
}
