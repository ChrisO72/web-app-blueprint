import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import { runnerProgressMs, type CodexProgress } from "~/control/runner-protocol";
import { Subheading } from "~/web/components/ui-kit/heading";
import { Text } from "~/web/components/ui-kit/text";
import type { loader } from "./activity-output";

export function useTaskCodexOutput(taskId: string | undefined, live: boolean) {
  const { data, load } = useFetcher<typeof loader>();
  useEffect(() => {
    if (!taskId) return;
    const url = "/control/activity/output?" + new URLSearchParams({ taskId });
    let loading = false;
    function refresh() {
      if (loading || document.visibilityState !== "visible") return;
      loading = true;
      void load(url)
        .catch(() => undefined)
        .finally(() => {
          loading = false;
        });
    }
    refresh();

    const timer = live ? window.setInterval(refresh, runnerProgressMs) : undefined;
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [live, load, taskId]);
  return taskId && data?.taskId === taskId ? data : undefined;
}

export function TaskCodexOutput({
  progress,
  live,
  error,
  loading,
}: {
  progress?: CodexProgress | null;
  live: boolean;
  error?: boolean;
  loading: boolean;
}) {
  const output = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const revision = progress?.revision;
  useEffect(() => {
    if (follow.current && output.current) output.current.scrollTop = output.current.scrollHeight;
  }, [revision]);

  return (
    <section className="space-y-2">
      <Subheading>Codex output</Subheading>
      {error ? (
        <Text>Could not load Codex output.</Text>
      ) : progress?.entries.length ? (
        <div
          ref={output}
          role="log"
          aria-label="Codex output"
          aria-live={live ? "polite" : "off"}
          tabIndex={0}
          className="max-h-[45vh] space-y-3 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-white/10 dark:bg-white/5"
          onScroll={(event) => {
            const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
            follow.current = scrollHeight - scrollTop - clientHeight < 24;
          }}
        >
          {progress.truncated && <Text>Showing the most recent output.</Text>}
          {progress.entries.map(({ id, kind, text }) =>
            kind === "tool" ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400" key={id}>
                {text}
              </p>
            ) : (
              <p className="text-sm/6 wrap-anywhere whitespace-pre-wrap" key={id}>
                {text}
              </p>
            ),
          )}
        </div>
      ) : (
        <Text>
          {loading
            ? "Loading Codex output…"
            : live
              ? "Waiting for Codex output…"
              : "No Codex output was saved for this task."}
        </Text>
      )}
    </section>
  );
}
