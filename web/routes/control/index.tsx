import { useState } from "react";
import { ServicePanel } from "~/control/components/service-panel";
import { environment } from "~/telemetry/config.server";
import { SiteMap } from "~/control/components/site-map";
import { site, type SystemId } from "~/system.config";
import { Heading } from "~/web/components/ui-kit/heading";
import { Text } from "~/web/components/ui-kit/text";
import { requireAdmin } from "~/web/lib/session.server";
import type { Route } from "./+types/index";

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
  return (
    <>
      <Heading>Overview</Heading>
      <Text className="mt-2 mb-6">{site.name} · Site map</Text>
      <SiteMap
        site={site}
        onSelect={(node) => {
          setSelected(node);
          setOpen(true);
        }}
      />
      {selected && (
        <ServicePanel
          key={selected}
          node={selected}
          open={open}
          onClose={() => setOpen(false)}
          defaultEnvironment={loaderData.sentryEnvironment}
        />
      )}
    </>
  );
}
