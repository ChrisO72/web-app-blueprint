import { SiteMap } from "~/control/components/site-map";
import { site } from "~/system.config";
import { Heading } from "~/web/components/ui-kit/heading";
import { Text } from "~/web/components/ui-kit/text";
import { requireAdmin } from "~/web/lib/session.server";
import type { Route } from "./+types/index";

export function loader({ context }: Route.LoaderArgs) {
  requireAdmin(context);
  return null;
}

export function meta() {
  return [{ title: `Overview · Control · ${site.name}` }];
}

export default function Control() {
  return (
    <>
      <Heading>Overview</Heading>
      <Text className="mt-2 mb-6">{site.name} · Site map</Text>
      <SiteMap site={site} />
    </>
  );
}
