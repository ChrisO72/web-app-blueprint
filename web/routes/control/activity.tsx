import { requireAdmin } from "~/web/lib/session.server";
import type { Route } from "./+types/activity";

export function loader({ context }: Route.LoaderArgs) {
  requireAdmin(context);
  return null;
}

export function meta() {
  return [{ title: "Activity · Control" }];
}

export default function Activity() {
  return null;
}
