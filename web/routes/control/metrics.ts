import { data } from "react-router";
import type { Route } from "./+types/metrics";
import { requireAdmin } from "~/web/lib/session.server";
import { readRenderMetrics } from "~/control/render.server";
import { renderNodes, renderQuerySchema } from "~/control/render";

export async function loader({ request, context }: Route.LoaderArgs) {
  requireAdmin(context);
  const parsed = renderQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  const headers = { "Cache-Control": "no-store" };
  if (!parsed.success)
    return data(
      { state: "error", metrics: [], message: "Invalid service." },
      { status: 400, headers },
    );
  if ("scope" in parsed.data) {
    const metrics = [];
    for (let index = 0; index < renderNodes.length; index += 2) {
      const pair = renderNodes.slice(index, index + 2);
      metrics.push(...(await Promise.all(pair.map((node) => readRenderMetrics(node, "overview")))));
    }
    return data({ overview: metrics }, { headers });
  }
  return data(await readRenderMetrics(parsed.data.node), { headers });
}
