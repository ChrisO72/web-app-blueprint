import { useId } from "react";
import { Link } from "react-router";
import { components, connections } from "~/shared/blueprint";
import type { traces } from "~/shared/blueprint";

type Trace = (typeof traces)[number];

// Shared dependencies sit between web and worker, with separate routes to each port.
const paths = {
  "web-api": "M565 110 V170",
  "api-repository": "M470 210 H335 V330",
  "worker-repository": "M470 530 H335 V410",
  "repository-database": "M240 370 H200",
  "api-queue": "M660 210 H1025 V330",
  "queue-worker": "M1025 410 V530 H660",
  "api-storage-adapter": "M565 250 V330",
  "worker-storage-adapter": "M565 490 V410",
  "storage-adapter-storage": "M660 370 H710",
  "worker-mail-adapter": "M565 570 V650 H710",
  "mail-adapter-mail": "M900 650 H950",
} satisfies {
  [Connection in (typeof connections)[number] as `${Connection[0]}-${Connection[1]}`]: string;
};

// Consecutive spans may return through their caller. Resolve them over the real
// connections instead of drawing a new, nonexistent link between span centers.
function traceConnections(trace?: Trace) {
  const highlighted = new Set<number>();
  if (!trace) return highlighted;
  for (let i = 1; i < trace.spans.length; i++) {
    const target = trace.spans[i].component;
    const pending = [{ key: trace.spans[i - 1].component, edges: [] as number[] }];
    const visited = new Set<string>();
    for (const current of pending) {
      if (current.key === target) {
        current.edges.forEach((edge) => highlighted.add(edge));
        break;
      }
      if (visited.has(current.key)) continue;
      visited.add(current.key);
      connections.forEach(([from, to], edge) => {
        const next = from === current.key ? to : to === current.key ? from : undefined;
        if (next && !visited.has(next)) {
          pending.push({ key: next, edges: [...current.edges, edge] });
        }
      });
    }
  }
  return highlighted;
}

export function SystemMap({
  href,
  selected,
  trace,
}: {
  href: (key: string) => string;
  selected?: string;
  trace?: Trace;
}) {
  const id = useId();
  const highlighted = traceConnections(trace);
  const tracedComponents = new Set(trace?.spans.map((span) => span.component));
  return (
    <div className="my-4 overflow-x-auto border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <svg
        viewBox="0 0 1160 740"
        className="w-full"
        role="group"
        aria-label="Blueprint system schematic"
        aria-describedby={`${id}-description`}
      >
        <desc id={`${id}-description`}>
          Web routes and worker jobs share repositories for PostgreSQL and an S3 adapter for
          storage. Redis connects web routes to the worker. Worker email passes through the mail
          adapter. Shared dependencies sit between web routes and worker jobs, with PostgreSQL on
          the left and Redis on the right. Select a component for details.
          {trace && ` Highlighted connections: ${trace.name}.`}
        </desc>
        <defs>
          <pattern id={`${id}-grid`} width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0 H0 V20" fill="none" className="stroke-zinc-100 dark:stroke-zinc-900" />
          </pattern>
          <marker
            id={`${id}-port`}
            viewBox="0 0 6 6"
            refX="3"
            refY="3"
            markerWidth="6"
            markerHeight="6"
            markerUnits="userSpaceOnUse"
          >
            <rect x="1" y="1" width="4" height="4" fill="context-stroke" />
          </marker>
        </defs>
        <rect width="1160" height="740" fill={`url(#${id}-grid)`} />
        {connections.map(([from, to], index) => {
          const active = highlighted.has(index);
          const d = paths[`${from}-${to}` as keyof typeof paths];
          return (
            <g key={`${from}-${to}`}>
              <title>
                {`${components.find((c) => c.key === from)?.name} ↔ ${components.find((c) => c.key === to)?.name}`}
              </title>
              <path
                d={d}
                fill="none"
                strokeWidth="8"
                className="stroke-white dark:stroke-zinc-950"
              />
              <path
                d={d}
                fill="none"
                strokeWidth={active ? 3 : 1.5}
                strokeLinejoin="miter"
                markerStart={`url(#${id}-port)`}
                markerEnd={`url(#${id}-port)`}
                className={
                  active
                    ? trace?.status === "error"
                      ? "stroke-rose-600 dark:stroke-rose-400"
                      : "stroke-emerald-600 dark:stroke-emerald-400"
                    : "stroke-zinc-400 dark:stroke-zinc-600"
                }
              />
            </g>
          );
        })}
        {components.map((c) => {
          const active = selected === c.key;
          const inTrace = tracedComponents.has(c.key);
          const passing = c.checks?.split("/");
          const healthy = passing?.[0] === passing?.[1];
          return (
            <Link
              key={c.key}
              to={href(c.key)}
              preventScrollReset
              aria-current={active ? "true" : undefined}
              aria-label={`${c.name}: ${c.checks ? `${c.checks} checks passing` : c.source}`}
              className="group outline-none"
            >
              <title>{c.detail}</title>
              <rect
                x={c.x}
                y={c.y}
                width={c.width}
                height="80"
                className={
                  active
                    ? "fill-blue-50 stroke-blue-600 dark:fill-blue-950 dark:stroke-blue-400"
                    : "fill-white stroke-zinc-400 group-hover:stroke-blue-500 group-focus-visible:stroke-blue-500 dark:fill-zinc-950 dark:stroke-zinc-600"
                }
                strokeWidth={active ? 2 : 1.5}
              />
              <path
                d={`M${c.x} ${c.y + 7} V${c.y} H${c.x + 7}`}
                fill="none"
                strokeWidth="3"
                className={
                  inTrace
                    ? trace?.status === "error"
                      ? "stroke-rose-600 dark:stroke-rose-400"
                      : "stroke-emerald-600 dark:stroke-emerald-400"
                    : "stroke-zinc-600 dark:stroke-zinc-400"
                }
              />
              <text
                x={c.x + 12}
                y={c.y + 25}
                className="fill-zinc-950 text-[13px] font-medium dark:fill-zinc-100"
              >
                {c.name}
              </text>
              <text
                x={c.x + 12}
                y={c.y + 44}
                className="fill-zinc-500 font-mono text-[10px] dark:fill-zinc-400"
              >
                {c.source}
              </text>
              <text
                x={c.x + 12}
                y={c.y + 65}
                className="fill-zinc-500 text-[11px] dark:fill-zinc-400"
              >
                {c.checks ? `${c.checks} checks passing` : "Shared module"}
              </text>
              {c.checks && (
                <rect
                  x={c.x + c.width - 17}
                  y={c.y + 58}
                  width="6"
                  height="6"
                  className={
                    healthy
                      ? "fill-emerald-600 dark:fill-emerald-400"
                      : "fill-amber-600 dark:fill-amber-400"
                  }
                />
              )}
            </Link>
          );
        })}
        <text x="30" y="718" className="fill-zinc-500 font-mono text-[10px] dark:fill-zinc-400">
          SYSTEM · SELECT A COMPONENT
        </text>
      </svg>
    </div>
  );
}
