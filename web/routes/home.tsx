import { redirect } from "react-router";
import { listSites } from "~/db/repositories/sites";
import { getAuthenticatedUser } from "~/web/lib/session.server";
import { Text } from "~/web/components/ui-kit/text";
import type { Route } from "./+types/home";
export async function loader({ context }: Route.LoaderArgs) {
  const sites = await listSites(getAuthenticatedUser(context).organizationId);
  return sites[0] ? redirect(`/sites/${sites[0].id}`) : null;
}
export default function Home() {
  return <Text>Add your first site from the site menu.</Text>;
}
