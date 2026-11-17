import { requireAdmin } from "~/web/lib/session.server";
import type { Route } from "./+types/settings";

export function loader({ context }: Route.LoaderArgs) {
  requireAdmin(context);
  return null;
}

export function meta() {
  return [{ title: "Settings · Control" }];
}

export default function Settings() {
  return null;
}
