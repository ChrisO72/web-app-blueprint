import { useEffect, useState } from "react";
import { ArrowPathIcon, ChevronDownIcon } from "@heroicons/react/16/solid";
import { Button } from "~/web/components/ui-kit/button";
import { Subheading } from "~/web/components/ui-kit/heading";
import { Text } from "~/web/components/ui-kit/text";
import { useFetcher } from "react-router";
import type { loader } from "~/web/routes/control/metrics";
import type { SystemId } from "~/system.config";
import { isStaleRenderMetric, renderRefreshInterval } from "../render";

export function ServiceMetrics({ node, open }: { node: SystemId; open: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const { load, data, state } = useFetcher<typeof loader>();
  const url = `/control/metrics?node=${node}`;
  const result = data && "node" in data && data.node === node ? data : undefined;
  const loading = state !== "idle" || !result;
  useEffect(() => {
    if (!open) return;
    void load(url);
    const interval = window.setInterval(() => {
      if (!document.hidden) void load(url);
    }, renderRefreshInterval);
    return () => window.clearInterval(interval);
  }, [load, open, url]);
  return (
    <section
      aria-label="Render metrics"
      className="border-b border-zinc-950/10 py-3 dark:border-white/10"
    >
      <div className="flex items-center justify-between gap-2">
        <Subheading>
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md focus-visible:outline-2 focus-visible:outline-blue-500"
          >
            <ChevronDownIcon
              aria-hidden="true"
              className={`size-4 text-zinc-500 ${expanded ? "" : "-rotate-90"}`}
            />
            Render metrics
          </button>
        </Subheading>
        <Button
          plain
          type="button"
          aria-label="Refresh Render metrics"
          disabled={loading}
          onClick={() => void load(url)}
        >
          <ArrowPathIcon data-slot="icon" />
        </Button>
      </div>
      {expanded && (
        <div className="mt-2 space-y-2" aria-busy={loading}>
          {!result && <Text role="status">Loading metrics…</Text>}
          {result?.message && (
            <Text className="text-xs!" role="status">
              {result.message}
            </Text>
          )}
          {result && result.metrics.length > 0 && (
            <dl className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {result.metrics.map((metric) => (
                <div
                  key={metric.label}
                  className="min-w-0 rounded-lg bg-zinc-50 px-2.5 py-2 dark:bg-white/5"
                >
                  <dt className="text-xs text-zinc-600 dark:text-zinc-400">{metric.label}</dt>
                  <dd className="text-base/6 font-semibold wrap-anywhere text-zinc-950 tabular-nums dark:text-white">
                    {metric.value ?? "Unavailable"}
                  </dd>
                  <dd className="text-xs wrap-anywhere text-zinc-600 dark:text-zinc-400">
                    {metric.detail}
                  </dd>
                  {isStaleRenderMetric(metric, result.fetchedAt) && metric.sampledAt && (
                    <dd className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                      Last sample{" "}
                      <time dateTime={metric.sampledAt}>
                        {new Date(metric.sampledAt).toLocaleString()}
                      </time>
                    </dd>
                  )}
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </section>
  );
}
