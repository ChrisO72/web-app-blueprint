import { useId, type ReactNode } from "react";
import clsx from "clsx";
import {
  CircleStackIcon,
  CloudIcon,
  CodeBracketSquareIcon,
  CubeIcon,
  ServerIcon,
} from "@heroicons/react/24/outline";
import { Link } from "react-router";
import { components, connections } from "~/shared/blueprint";
import type { traces } from "~/shared/blueprint";

type Trace = (typeof traces)[number];
type Component = (typeof components)[number];

const nodeIcons = {
  process: ServerIcon,
  module: CodeBracketSquareIcon,
  adapter: CubeIcon,
  store: CircleStackIcon,
  service: CloudIcon,
} satisfies Record<Component["kind"], typeof ServerIcon>;

// Each adapter has one shared stem and a horizontal track that branches toward
// Worker and Web. Only wires belonging to the same dependency share a segment.
const paths = {
  "web-repository": "M202.5 239.5 V256 H784 V320",
  "worker-repository": "M202.5 239.5 V256 H156 V320",
  "repository-database": "M202.5 177 V157",
  "web-queue-adapter": "M407.5 239.5 V272 H768 V320",
  "queue-adapter-queue": "M407.5 177 V157",
  "queue-adapter-worker": "M407.5 239.5 V272 H172 V320",
  "web-storage-adapter": "M612.5 239.5 V288 H752 V320",
  "worker-storage-adapter": "M612.5 239.5 V288 H188 V320",
  "storage-adapter-storage": "M612.5 177 V157",
  "worker-mail-adapter": "M265 445 V477",
  "mail-adapter-mail": "M265 539.5 V571.5",
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
    const pending: { key: Component["key"]; edges: number[] }[] = [
      { key: trace.spans[i - 1].component, edges: [] },
    ];
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
  summary,
  fullSize = false,
}: {
  href: (key: string) => string;
  selected?: string;
  trace?: Trace;
  summary?: ReactNode;
  fullSize?: boolean;
}) {
  const id = useId();
  const highlighted = traceConnections(trace);
  const tracedComponents = new Set<Component["key"]>(trace?.spans.map((span) => span.component));
  return (
    <div
      className={clsx(
        "overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-950",
        fullSize ? "flex min-h-[max(32rem,calc(100svh-14rem))] flex-col" : "my-4",
      )}
    >
      {summary && <div className="shrink-0 px-5 pt-4">{summary}</div>}
      <div className={clsx("overflow-x-auto p-2 sm:p-4", fullSize && "flex-1")}>
        <svg
          viewBox="0 0 960 670"
          preserveAspectRatio="xMidYMid meet"
          className="mx-auto block h-auto w-full max-w-[960px] min-w-[640px]"
          role="group"
          aria-label="Blueprint system schematic"
          aria-describedby={`${id}-description`}
        >
          <desc id={`${id}-description`}>
            Web routes and worker jobs share repositories for PostgreSQL and an S3 adapter for
            storage. Redis connects web routes to the worker. Worker email passes through the mail
            adapter. PostgreSQL, Redis, and S3 storage sit across the top, with repositories,
            BullMQ, and the S3 adapter beneath them. Worker and Web sit side by side below these
            shared dependencies. The mail adapter and provider sit below Worker. A shared unit
            defines every card: processes are four units wide and two high, stores are two by two,
            external providers are four by one, and modules and adapters are two by one. Web lists
            API, UI, Admin, and iOS app services. Worker lists Auth, Payment, and Files services.
            Select a component for details.
            {trace && ` Highlighted connections: ${trace.name}.`}
          </desc>
          <defs>
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
          {components.map((c) => {
            const active = selected === c.key;
            const inTrace = tracedComponents.has(c.key);
            const compact = c.kind === "module" || c.kind === "adapter";
            const process = c.kind === "process";
            const service = c.kind === "service";
            const store = c.kind === "store";
            const services = "services" in c ? c.services : undefined;
            const padding = 16;
            const textX = c.x + padding;
            const contentTop = c.y + (c.height - (compact ? 40 : service ? 36 : 88)) / 2;
            const iconSize = compact ? 16 : 18;
            const iconX = textX;
            const iconY = contentTop;
            const Icon = nodeIcons[c.kind];
            const passing = c.checks?.split("/");
            const healthy = passing?.[0] === passing?.[1];
            return (
              <Link
                key={c.key}
                to={href(c.key)}
                preventScrollReset
                aria-current={active ? "true" : undefined}
                aria-label={`${c.name}${services ? `, services: ${services.join(", ")}` : ""}, ${c.label}: ${c.checks ? `${c.checks} checks passing` : c.source}${inTrace ? ", in highlighted trace" : ""}`}
                className="group outline-none"
              >
                <title>{`${c.name} · ${c.label}\n${c.source}\n${c.detail}`}</title>
                <rect
                  x={c.x}
                  y={c.y}
                  width={c.width}
                  height={c.height}
                  rx="12"
                  className={clsx(
                    "group-hover:stroke-blue-500 group-focus-visible:stroke-blue-600 group-focus-visible:[stroke-width:3] dark:group-focus-visible:stroke-blue-400",
                    active
                      ? "fill-blue-50 stroke-blue-600 dark:fill-blue-950 dark:stroke-blue-400"
                      : inTrace
                        ? trace?.status === "error"
                          ? "fill-rose-50 stroke-rose-600 dark:fill-rose-950 dark:stroke-rose-400"
                          : "fill-emerald-50 stroke-emerald-600 dark:fill-emerald-950 dark:stroke-emerald-400"
                        : "fill-white stroke-zinc-200 dark:fill-zinc-950 dark:stroke-zinc-700",
                  )}
                  strokeWidth={active || inTrace ? 2 : 1.5}
                />
                <g className="pointer-events-none">
                  <rect
                    x={iconX - 3}
                    y={iconY - 3}
                    width={iconSize + 6}
                    height={iconSize + 6}
                    rx="6"
                    className="fill-zinc-100 dark:fill-zinc-900"
                  />
                  <Icon
                    x={iconX}
                    y={iconY}
                    width={iconSize}
                    height={iconSize}
                    data-slot="icon"
                    aria-hidden="true"
                    className="text-zinc-500 dark:text-zinc-400"
                  />
                  {!compact && !process && (
                    <text
                      x={textX}
                      y={contentTop + (store ? 61 : 36)}
                      className="fill-zinc-600 text-[11px] font-medium dark:fill-zinc-400"
                    >
                      {c.label}
                    </text>
                  )}
                  <text
                    x={compact || store ? textX : textX + 26}
                    y={contentTop + (compact ? 38 : store ? 41 : process ? 17 : 16)}
                    className={clsx(
                      "fill-zinc-950 font-semibold dark:fill-zinc-100",
                      process ? "text-[21px]" : compact ? "text-[14px]" : "text-[16px]",
                    )}
                  >
                    {c.name}
                  </text>
                  {services && (
                    <>
                      <path
                        d={`M${textX} ${contentTop + 32} H${c.x + c.width - padding}`}
                        className="stroke-zinc-100 dark:stroke-zinc-800"
                      />
                      {services.map((name, index) => (
                        <text
                          key={name}
                          x={textX + (index % 2) * ((c.width - 2 * padding) / 2)}
                          y={contentTop + 54 + Math.floor(index / 2) * 24}
                          className="fill-zinc-600 text-[13px] dark:fill-zinc-400"
                        >
                          {name}
                        </text>
                      ))}
                    </>
                  )}
                  {!compact && c.checks && (
                    <g
                      transform={`translate(${process || service ? c.x + c.width - padding - 32 : textX} ${contentTop + (process ? 16 : service ? 36 : 81)})`}
                    >
                      <circle
                        cy="-4"
                        r="6"
                        className={
                          healthy
                            ? "fill-emerald-600 dark:fill-emerald-400"
                            : "fill-amber-600 dark:fill-amber-400"
                        }
                      />
                      <path
                        d={healthy ? "M-3 -4 l2 2 4 -4" : "M0 -7 V-4 M0 -1.5 v0.5"}
                        fill="none"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="miter"
                        className="stroke-white dark:stroke-zinc-950"
                      />
                      <text x="13" className="fill-zinc-600 text-[12px] dark:fill-zinc-400">
                        {process || service
                          ? c.checks
                          : `${c.checks} checks${store ? "" : " passing"}`}
                      </text>
                    </g>
                  )}
                </g>
              </Link>
            );
          })}
          {connections
            .map(([from, to], index) => ({ from, to, index }))
            // Highlighted routes paint last so a shared stem retains its trace color.
            .sort((a, b) => Number(highlighted.has(a.index)) - Number(highlighted.has(b.index)))
            .map(({ from, to, index }) => {
              const active = highlighted.has(index);
              const d = paths[`${from}-${to}` as keyof typeof paths];
              return (
                <g key={`${from}-${to}`} className="pointer-events-none">
                  <title>
                    {`${components.find((c) => c.key === from)?.name} ↔ ${components.find((c) => c.key === to)?.name}`}
                  </title>
                  <path
                    d={d}
                    fill="none"
                    strokeWidth={active ? 7 : 5}
                    strokeLinejoin="miter"
                    className="stroke-zinc-50 dark:stroke-zinc-950"
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
          {[
            { key: "repository", x: 202.5, y: 256 },
            { key: "queue-adapter", x: 407.5, y: 272 },
            { key: "storage-adapter", x: 612.5, y: 288 },
          ].map((junction) => {
            const active = connections.some(
              ([from, to], index) =>
                highlighted.has(index) && (from === junction.key || to === junction.key),
            );
            return (
              <circle
                key={junction.key}
                cx={junction.x}
                cy={junction.y}
                r="2.5"
                className={
                  active
                    ? trace?.status === "error"
                      ? "fill-rose-600 dark:fill-rose-400"
                      : "fill-emerald-600 dark:fill-emerald-400"
                    : "fill-zinc-400 dark:fill-zinc-600"
                }
                aria-hidden="true"
              />
            );
          })}
        </svg>
      </div>
      <p className="shrink-0 border-t border-zinc-200 px-5 py-3 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
        Select a component for details
      </p>
    </div>
  );
}
