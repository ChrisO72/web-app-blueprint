import { data } from "react-router";
import type { Route } from "./+types/metrics";
import { requireAdmin } from "~/web/lib/session.server";
import { readRenderMetrics } from "~/control/render.server";
import { renderQuerySchema } from "~/control/render";

export async function loader({ request, context }: Route.LoaderArgs) {
  requireAdmin(context);
  const parsed = renderQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  const headers = { "Cache-Control": "no-store" };
  if (!parsed.success)
    return data(
      { state: "error", metrics: [], message: "Invalid service." },
      { status: 400, headers },
    );
  return data(await readRenderMetrics(parsed.data.node), { headers });
}
