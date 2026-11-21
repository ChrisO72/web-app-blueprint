import type { SiteConfig, SystemId } from "~/system.config";

export const systemKinds = {
  process: { label: "Process", color: "text-blue-600 dark:text-blue-400" },
  module: { label: "Module", color: "text-violet-600 dark:text-violet-400" },
  store: { label: "Store", color: "text-emerald-600 dark:text-emerald-400" },
  service: { label: "Service", color: "text-cyan-700 dark:text-cyan-400" },
} satisfies Record<SiteConfig["systems"][SystemId]["kind"], { label: string; color: string }>;
