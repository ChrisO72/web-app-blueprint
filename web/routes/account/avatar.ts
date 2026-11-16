import { redirect } from "react-router";
import { getOwnedAvatarFile } from "~/db/repositories/files";
import { createFilePreviewUrl, isFileStorageEnabled } from "~/integrations/storage/objects.server";
import { requireRegistered } from "~/web/lib/session.server";
import type { Route } from "./+types/avatar";

export async function loader({ context }: Route.LoaderArgs) {
  const user = requireRegistered(context);
  const headers = { "Cache-Control": "no-store" };
  if (!isFileStorageEnabled || user.avatarFileId === null)
    throw new Response("Not found", { status: 404, headers });
  const file = await getOwnedAvatarFile(user.avatarFileId, user.organizationId, user.id);
  if (!file || file.status !== "ready") throw new Response("Not found", { status: 404, headers });
  return redirect(await createFilePreviewUrl(file.storageKey, file.contentType), { headers });
}
