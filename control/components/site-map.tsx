import { useId } from "react";
import {
  CircleStackIcon,
  CloudIcon,
  CodeBracketSquareIcon,
  CubeIcon,
  ServerIcon,
} from "@heroicons/react/24/outline";
import type { SiteConfig, SystemId } from "~/system.config";
import { renderResourceName, summarizeRenderMetrics, type RenderMetrics } from "../render";
import { systemKinds } from "./system-kind";

const icons = {
  process: ServerIcon,
  module: CodeBracketSquareIcon,
  adapter: CubeIcon,
  store: CircleStackIcon,
  service: CloudIcon,
};

const healthTags = {
  healthy: {
    label: "Healthy",
    color: "text-emerald-700 dark:text-emerald-400",
    background: "fill-emerald-50 dark:fill-emerald-500/15",
  },
  warning: {
    label: "Warning",
    color: "text-orange-700 dark:text-orange-400",
    background: "fill-orange-50 dark:fill-orange-500/15",
  },
  critical: {
    label: "Critical",
    color: "text-red-700 dark:text-red-400",
    background: "fill-red-50 dark:fill-red-500/15",
  },
  unknown: {
    label: "No data",
    color: "text-zinc-600 dark:text-zinc-400",
    background: "fill-zinc-100 dark:fill-white/10",
  },
  loading: {
    label: "Loading",
    color: "text-zinc-600 dark:text-zinc-400",
    background: "fill-zinc-100 dark:fill-white/10",
  },
};

const sizes = {
  process: { width: 250, height: 125 },
  module: { width: 125, height: 62.5 },
  adapter: { width: 125, height: 62.5 },
  store: { width: 125, height: 125 },
  service: { width: 250, height: 62.5 },
};

const positions = {
  web: [550, 320],
  worker: [140, 320],
  repositories: [140, 177],
  database: [140, 32],
  redis: [345, 32],
  queue: [345, 177],
  storageAdapter: [550, 177],
  storage: [550, 32],
  mailAdapter: [202.5, 477],
  mail: [140, 571.5],
  control: [940, 177],
  controlDatabase: [940, 32],
  sentryAdapter: [612.5, 477],
  sentry: [550, 571.5],
  githubAdapter: [940, 477],
  github: [877.5, 571.5],
} satisfies Record<SystemId, [number, number]>;

const paths = {
  "web-repositories": "M202.5 239.5 V256 H784 V320",
  "worker-repositories": "M202.5 239.5 V256 H156 V320",
  "repositories-database": "M202.5 177 V157",
  "web-queue": "M407.5 239.5 V272 H768 V320",
  "queue-redis": "M407.5 177 V157",
  "queue-worker": "M407.5 239.5 V272 H172 V320",
  "web-storageAdapter": "M612.5 239.5 V288 H752 V320",
  "worker-storageAdapter": "M612.5 239.5 V288 H188 V320",
  "storageAdapter-storage": "M612.5 177 V157",
  "worker-mailAdapter": "M265 445 V477",
  "mailAdapter-mail": "M265 539.5 V571.5",
  "web-control": "M784 320 V304 H1002.5 V239.5",
  "control-controlDatabase": "M1002.5 177 V157",
  "worker-control": "M374 445 V460 H850 V208.25 H940",
  "web-sentryAdapter": "M675 445 V477",
  "worker-sentryAdapter": "M330 445 V468 H651 V477",
  "control-sentryAdapter": "M940 192 H866 V508.25 H737.5",
  "sentryAdapter-sentry": "M675 539.5 V571.5",
  "control-githubAdapter": "M1002.5 239.5 V477",
  "githubAdapter-github": "M1002.5 539.5 V571.5",
  "github-web": "M877.5 602.75 H830 V390 H800",
} satisfies {
  [Connection in SiteConfig["connections"][number] as `${Connection[0]}-${Connection[1]}`]: string;
};

export function SiteMap({
  site,
  metrics,
  onSelect,
}: {
  site: SiteConfig;
  metrics?: RenderMetrics[];
  onSelect: (node: SystemId) => void;
}) {
  const id = useId();
  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-zinc-950">
      <svg
        viewBox="120 12 1028 642"
        className="block h-auto w-full min-w-[824px]"
        role="group"
        aria-labelledby={`${id}-title ${id}-description`}
      >
        <title id={`${id}-title`}>{site.name} site map</title>
        <desc id={`${id}-description`}>
          {site.connections
            .map(([from, to]) => `${site.systems[from].name} connects to ${site.systems[to].name}.`)
            .join(" ")}
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
        {(Object.keys(site.systems) as SystemId[]).map((node) => {
          const system = site.systems[node];
          const [x, y] = positions[node];
          const size = sizes[system.kind];
          const Icon = icons[system.kind];
          const compact = system.kind === "module" || system.kind === "adapter";
          const store = system.kind === "store";
          const process = system.kind === "process";
          const external = system.kind === "service";
          const kind = systemKinds[system.kind];
          const monitored = Boolean(renderResourceName(node));
          const result = metrics?.find((entry) => entry.node === node);
          const summary = result && summarizeRenderMetrics(result);
          const badge = healthTags[summary?.health ?? (monitored ? "loading" : "unknown")];
          const metric = summary?.metric;
          const tagX = size.width - 77;
          return (
            <g
              key={node}
              transform={`translate(${x} ${y})`}
              role="button"
              tabIndex={0}
              aria-label={`View ${system.name} details`}
              aria-description={[
                !monitored ? "No Render monitoring" : badge.label,
                metric && `${metric.label} ${metric.value}`,
              ]
                .filter(Boolean)
                .join(". ")}
              aria-haspopup="dialog"
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(node);
                }
              }}
              className="group cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-500"
              onClick={() => onSelect(node)}
            >
              <title>{`${system.name}: ${system.description} (${system.source})`}</title>
              <rect
                {...size}
                rx="14"
                strokeWidth="1.5"
                className="fill-white stroke-zinc-200 group-hover:fill-zinc-50 group-hover:stroke-zinc-400 dark:fill-zinc-950 dark:stroke-zinc-700 dark:group-hover:fill-zinc-900 dark:group-hover:stroke-zinc-500"
              />
              <rect
                x="11"
                y="9"
                width="26"
                height="26"
                rx="8"
                className="fill-zinc-100 dark:fill-white/10"
              />
              <Icon
                x="16"
                y="14"
                width="16"
                height="16"
                aria-hidden="true"
                className={kind.color}
              />
              <rect x={tagX} y="12" width="66" height="20" rx="10" className={badge.background} />
              <circle cx={tagX + 10} cy="22" r="3" className={`fill-current ${badge.color}`} />
              <text
                x={tagX + 17}
                y="26"
                className={`fill-current text-[10px] font-medium ${badge.color}`}
              >
                {badge.label}
              </text>
              <text
                x={external ? 44 : 12}
                y={compact ? 49 : external ? 26 : 61}
                className={`fill-zinc-950 font-semibold dark:fill-zinc-100 ${process ? "text-[21px]" : compact || store ? "text-[14px]" : "text-[16px]"}`}
              >
                {system.name}
              </text>
              {metric ? (
                <>
                  <text x="12" y="86" className="fill-zinc-500 text-[10px] dark:fill-zinc-400">
                    {metric.label}
                  </text>
                  <text
                    x="12"
                    y="106"
                    className="fill-zinc-950 text-[13px] font-semibold tabular-nums dark:fill-zinc-100"
                    textLength={store && metric.value.length > 15 ? 101 : undefined}
                    lengthAdjust="spacingAndGlyphs"
                  >
                    {metric.value}
                  </text>
                </>
              ) : (
                !compact && (
                  <text
                    x={external ? 44 : 12}
                    y={external ? 46 : 89}
                    className="fill-zinc-500 text-[11px] dark:fill-zinc-400"
                  >
                    {system.source}
                  </text>
                )
              )}
            </g>
          );
        })}
        {site.connections.map(([from, to]) => {
          const d = paths[`${from}-${to}` as keyof typeof paths];
          return (
            <g key={`${from}-${to}`} className="pointer-events-none">
              <path
                d={d}
                fill="none"
                strokeWidth="5"
                className="stroke-zinc-50 dark:stroke-zinc-950"
              />
              <path
                d={d}
                fill="none"
                strokeWidth="1.5"
                strokeLinejoin="miter"
                markerStart={`url(#${id}-port)`}
                markerEnd={`url(#${id}-port)`}
                className="stroke-zinc-400 dark:stroke-zinc-600"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
