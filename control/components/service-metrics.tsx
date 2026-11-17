import { useEffect } from "react";
import { useFetcher } from "react-router";
import { ArrowPathIcon } from "@heroicons/react/16/solid";
import type { SystemId } from "~/system.config";
import { Button } from "~/web/components/ui-kit/button";
import { Text } from "~/web/components/ui-kit/text";
import type { RenderMetrics } from "../render";

export function ServiceMetrics({ node, active }: { node: SystemId; active: boolean }) {
  const fetcher = useFetcher<RenderMetrics>();
  const { load } = fetcher;
  const url = `/control/metrics?${new URLSearchParams({ node })}`;
  useEffect(() => {
    if (!active) return;
    void load(url);
    const interval = window.setInterval(() => {
      if (!document.hidden) void load(url);
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [active, load, url]);
  const result = fetcher.data?.node === node ? fetcher.data : undefined;
  const loading = fetcher.state !== "idle" || !result;
  return (
    <section className="py-6" aria-label="Render metrics" aria-busy={loading}>
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <Text>Render deployment · last hour</Text>
          {result?.fetchedAt && (
            <Text className="text-xs!">
              Fetched {new Date(result.fetchedAt).toLocaleTimeString()} · refreshes every minute
            </Text>
          )}
        </div>
        <Button
          outline
          disabled={loading}
          aria-label="Refresh metrics"
          onClick={() => void load(url)}
        >
          <ArrowPathIcon />
        </Button>
      </div>
      {!result ? (
        <Text role="status">Loading metrics…</Text>
      ) : (
        <>
          {result.message && (
            <Text className="mb-5" role="status">
              {result.message}
            </Text>
          )}
          <dl className="grid grid-cols-2 gap-3">
            {result.metrics.map((metric) => {
              const stale =
                metric.sampledAt && Date.now() - Date.parse(metric.sampledAt) > 3 * 60_000;
              return (
                <div
                  key={metric.label}
                  className="rounded-lg border border-zinc-950/10 p-4 dark:border-white/10"
                >
                  <dt className="text-sm text-zinc-500 dark:text-zinc-400">{metric.label}</dt>
                  <dd className="mt-1 text-xl font-semibold text-zinc-950 tabular-nums dark:text-white">
                    {metric.value ?? "Unavailable"}
                  </dd>
                  <dd className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{metric.detail}</dd>
                  {stale && metric.sampledAt && (
                    <dd className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                      Last sample {new Date(metric.sampledAt).toLocaleString()}
                    </dd>
                  )}
                </div>
              );
            })}
          </dl>
          <Text className="mt-5 text-xs!">
            Render metrics are independent of the Sentry environment filter.
          </Text>
        </>
      )}
    </section>
  );
}
