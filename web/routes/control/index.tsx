import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { renderRefreshInterval } from "~/control/render";
import type { loader as metricsLoader } from "~/web/routes/control/metrics";
import { ServicePanel } from "~/control/components/service-panel";
import { environment } from "~/telemetry/config.server";
import { SiteMap } from "~/control/components/site-map";
import { site, type SystemId } from "~/system.config";
import { Heading } from "~/web/components/ui-kit/heading";
import { requireAdmin } from "~/web/lib/session.server";
import type { Route } from "./+types/index";

const overviewMetricsUrl = "/control/metrics?scope=overview";

export function loader({ context }: Route.LoaderArgs) {
  requireAdmin(context);
  return { sentryEnvironment: environment };
}

export function meta() {
  return [{ title: `Overview · Control · ${site.name}` }];
}

export default function Control({ loaderData }: Route.ComponentProps) {
  const [selected, setSelected] = useState<SystemId | null>(null);
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher<typeof metricsLoader>();
  const { load } = fetcher;
  const metrics = fetcher.data && "overview" in fetcher.data ? fetcher.data.overview : undefined;

  useEffect(() => {
    void load(overviewMetricsUrl);
    const interval = window.setInterval(() => {
      if (!document.hidden) void load(overviewMetricsUrl);
    }, renderRefreshInterval);
    return () => window.clearInterval(interval);
  }, [load]);

  function select(node: SystemId) {
    setSelected(node);
    setOpen(true);
  }
  return (
    <div className="min-w-0 space-y-3">
      <Heading>Overview</Heading>
      <SiteMap site={site} metrics={metrics} onSelect={select} />
      {selected && (
        <ServicePanel
          key={selected}
          node={selected}
          open={open}
          onClose={() => setOpen(false)}
          defaultEnvironment={loaderData.sentryEnvironment}
        />
      )}
    </div>
  );
}
