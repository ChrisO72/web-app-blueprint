import { useId } from "react";
import {
  CircleStackIcon,
  CloudIcon,
  CodeBracketSquareIcon,
  CubeIcon,
  ServerIcon,
} from "@heroicons/react/24/outline";
import type { SiteConfig, SystemId } from "~/system.config";

const icons = {
  process: ServerIcon,
  module: CodeBracketSquareIcon,
  adapter: CubeIcon,
  store: CircleStackIcon,
  service: CloudIcon,
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
  onSelect,
}: {
  site: SiteConfig;
  onSelect: (node: SystemId) => void;
}) {
  const id = useId();
  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <svg
        viewBox="0 0 1200 670"
        className="mx-auto block h-auto w-full max-w-[1200px] min-w-[960px]"
        role="img"
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
        {Object.entries(site.systems).map(([key, system]) => {
          const [x, y] = positions[key as SystemId];
          const size = sizes[system.kind];
          const Icon = icons[system.kind];
          const compact = system.kind === "module" || system.kind === "adapter";
          const store = system.kind === "store";
          const process = system.kind === "process";
          return (
            <g
              key={key}
              transform={`translate(${x} ${y})`}
              className="group cursor-pointer"
              onClick={() => onSelect(key as SystemId)}
            >
              <title>{`${system.name}: ${system.description} (${system.source})`}</title>
              <rect
                {...size}
                rx="12"
                strokeWidth="1.5"
                className="fill-white stroke-zinc-200 group-hover:fill-zinc-50 group-hover:stroke-zinc-400 dark:fill-zinc-950 dark:stroke-zinc-700 dark:group-hover:fill-zinc-900 dark:group-hover:stroke-zinc-500"
              />
              <Icon
                x="16"
                y={process ? 24 : 12}
                width="18"
                height="18"
                aria-hidden="true"
                className="text-zinc-500 dark:text-zinc-400"
              />
              <text
                x={compact || store ? 16 : 42}
                y={compact ? 47 : store ? 73 : process ? 40 : 28}
                className={`fill-zinc-950 font-semibold dark:fill-zinc-100 ${process ? "text-[21px]" : compact ? "text-[14px]" : "text-[16px]"}`}
              >
                {system.name}
              </text>
              {!compact && (
                <text
                  x={system.kind === "service" ? 42 : 16}
                  y={store ? 98 : process ? 85 : 48}
                  className="fill-zinc-500 text-[11px] dark:fill-zinc-400"
                >
                  {system.source}
                </text>
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
                className="stroke-white dark:stroke-zinc-950"
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
