import { z } from "zod";
import { getConnection, updateConnection } from "~/control/db/repositories/github.server";
import { decryptSecret, verifyWebhook } from "~/integrations/github/secrets.server";
import { enqueueGithubSync } from "~/worker/jobs/sync-github";
import type { RecordKind } from "~/integrations/github/records";
import type { Route } from "./+types/github";

const identifier = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const envelope = z
  .object({ repository: z.object({ id: identifier }), action: z.string().optional() })
  .passthrough();
const record = z.object({ id: identifier, number: identifier.optional() });

async function bodyBytes(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) return Buffer.concat(chunks);
    size += chunk.value.length;
    if (size > 25 * 1024 * 1024) {
      await reader.cancel();
      throw new Response("Payload too large", { status: 413 });
    }
    chunks.push(chunk.value);
  }
}
async function receive(request: Request) {
  const connection = await getConnection();
  if (
    !connection?.repositoryId ||
    !connection.encryptedWebhookSecret ||
    connection.status === "disconnecting"
  )
    return new Response("Not connected", { status: 404 });
  if (new URL(request.url).searchParams.get("connection") !== connection.id)
    return new Response("Wrong connection", { status: 403 });
  const body = await bodyBytes(request);
  if (
    !verifyWebhook(
      body,
      request.headers.get("x-hub-signature-256"),
      decryptSecret(connection.encryptedWebhookSecret),
    )
  )
    return new Response("Invalid signature", { status: 401 });
  let payload: unknown;
  try {
    payload = JSON.parse(body.toString("utf8"));
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const parsed = envelope.safeParse(payload);
  if (!parsed.success) return new Response("Invalid payload", { status: 400 });
  if (parsed.data.repository.id !== connection.repositoryId)
    return new Response("Wrong repository", { status: 403 });
  const event = request.headers.get("x-github-event");
  if (event === "ping") {
    if (connection.webhookId) await updateConnection(connection.id, { lastWebhookAt: new Date() });
    return new Response(null, { status: 204 });
  }
  const kind: RecordKind | null =
    event === "issues"
      ? "issue"
      : event === "pull_request"
        ? "pull"
        : event === "workflow_run"
          ? "run"
          : null;
  if (!kind) return new Response(null, { status: 204 });
  const delivery = z.uuid().safeParse(request.headers.get("x-github-delivery"));
  const item = record.safeParse(
    parsed.data[
      event === "issues" ? "issue" : event === "pull_request" ? "pull_request" : "workflow_run"
    ],
  );
  if (!delivery.success || !item.success || (kind !== "run" && !item.data.number))
    return new Response("Invalid delivery", { status: 400 });
  await enqueueGithubSync(
    {
      kind: "record",
      connectionId: connection.id,
      recordKind: kind,
      githubId: item.data.id,
      number: item.data.number ?? item.data.id,
      deleted: parsed.data.action === "deleted",
    },
    delivery.data,
  );
  if (connection.webhookId) await updateConnection(connection.id, { lastWebhookAt: new Date() });
  return new Response(null, { status: 202 });
}
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      receive(request),
      new Promise<Response>((resolve) => {
        deadline = setTimeout(
          () => resolve(new Response("Webhook temporarily unavailable", { status: 503 })),
          8500,
        );
      }),
    ]);
  } catch (error) {
    return error instanceof Response
      ? error
      : new Response("Webhook temporarily unavailable", { status: 503 });
  } finally {
    clearTimeout(deadline);
  }
}
