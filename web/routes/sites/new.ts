import { redirect } from "react-router";
import { z } from "zod";
import { createSite } from "~/db/repositories/sites";
import { requireRegistered } from "~/web/lib/session.server";
import { parseForm, type ActionData } from "~/web/lib/form";
import type { Route } from "./+types/new";
export function loader() {
  return redirect("/");
}
export async function action({
  context,
  request,
}: Route.ActionArgs): Promise<ActionData & { siteId?: number }> {
  const user = requireRegistered(context);
  const { data, fieldErrors } = parseForm(
    await request.formData(),
    z.object({ name: z.string().trim().min(1).max(100) }),
  );
  if (fieldErrors) return { fieldErrors };
  const site = await createSite(user.organizationId, data.name);
  return { siteId: site.id };
}
