import { useEffect, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import { z } from "zod";
import { requireAdmin } from "~/web/lib/session.server";
import { parseForm, type ActionData } from "~/web/lib/form";
import {
  settingsData,
  saveToken,
  connectRepository,
  requestSync,
  replaceToken,
  disconnect,
  publicError,
} from "~/control/github.server";
import { Heading, Subheading } from "~/web/components/ui-kit/heading";
import { Text, TextLink } from "~/web/components/ui-kit/text";
import { Button } from "~/web/components/ui-kit/button";
import { Input } from "~/web/components/ui-kit/input";
import { Select } from "~/web/components/ui-kit/select";
import { Field, Label, Description } from "~/web/components/ui-kit/fieldset";
import { Badge } from "~/web/components/ui-kit/badge";
import { FormError } from "~/web/components/form-error";
import { FieldError } from "~/web/components/field-error";
import type { Route } from "./+types/settings";

const connectionId = z.uuid();
const token = z
  .string()
  .trim()
  .min(1, "Enter your fine-grained personal access token.")
  .max(1024, "Invalid token.");
const formSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("validate"), token }),
  z.object({
    intent: z.literal("connect"),
    connectionId,
    repositoryId: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  }),
  z.object({ intent: z.literal("replace"), connectionId, token }),
  z.object({ intent: z.enum(["sync", "disconnect"]), connectionId }),
]);
export async function loader({ context }: Route.LoaderArgs) {
  requireAdmin(context);
  return settingsData();
}
export async function action({
  request,
  context,
}: Route.ActionArgs): Promise<ActionData & { success?: boolean }> {
  requireAdmin(context);
  if (request.method !== "POST") throw new Response("Method not allowed", { status: 405 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new Response("Forbidden", { status: 403 });
  const { data, fieldErrors } = parseForm(await request.formData(), formSchema);
  if (fieldErrors) return { fieldErrors };
  try {
    switch (data.intent) {
      case "validate":
        await saveToken(data.token);
        break;
      case "connect":
        await connectRepository(data.connectionId, data.repositoryId);
        break;
      case "replace":
        await replaceToken(data.connectionId, data.token);
        break;
      case "sync":
        await requestSync(data.connectionId);
        break;
      case "disconnect":
        await disconnect(data.connectionId);
        break;
    }
    return { success: true };
  } catch (error) {
    return { formError: publicError(error) };
  }
}
export function meta() {
  return [{ title: "Settings · Control" }];
}

export default function Settings({ loaderData }: Route.ComponentProps) {
  const { connection, repositories, setup, error } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  const [tokenValue, setTokenValue] = useState("");
  const { revalidate } = useRevalidator();
  useEffect(() => {
    if (fetcher.data?.success) setTokenValue("");
  }, [fetcher.data]);
  useEffect(() => {
    if (connection?.status !== "syncing") return;
    const interval = setInterval(() => {
      void revalidate();
    }, 3000);
    return () => clearInterval(interval);
  }, [connection?.status, revalidate]);
  const tokenForm = (intent: "validate" | "replace") => (
    <fetcher.Form method="post" className="mt-6 space-y-4">
      <input type="hidden" name="intent" value={intent} />
      {connection && <input type="hidden" name="connectionId" value={connection.id} />}
      <Field>
        <Label>Fine-grained personal access token</Label>
        <Input
          name="token"
          type="password"
          autoComplete="new-password"
          required
          value={tokenValue}
          onChange={(event) => setTokenValue(event.target.value)}
          disabled={busy || !setup.ready}
          invalid={!!fetcher.data?.fieldErrors?.token}
        />
        <Description>
          Repository permissions: Metadata, Issues, Pull requests, and Actions read; Webhooks write.
        </Description>
        <FieldError name="token" actionData={fetcher.data} />
      </Field>
      <Button type="submit" disabled={busy || !setup.ready}>
        {intent === "validate" ? "Validate token" : "Replace token"}
      </Button>
    </fetcher.Form>
  );
  return (
    <div className="max-w-3xl">
      <Heading>Settings</Heading>
      <Subheading className="mt-8">GitHub</Subheading>
      <Text className="mt-2">
        Connect one repository to mirror its issues, pull requests, and Actions runs.
      </Text>
      {!setup.ready && (
        <p role="status" className="mt-4 text-sm text-amber-700 dark:text-amber-400">
          {setup.error}
        </p>
      )}
      <div className="mt-4">
        <FormError actionData={fetcher.data} />
      </div>
      {error && (
        <p role="status" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {!connection ? (
        tokenForm("validate")
      ) : (
        <>
          <div className="mt-6 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              {connection.url ? (
                <TextLink href={connection.url} target="_blank" rel="noreferrer">
                  {connection.owner}/{connection.name}
                </TextLink>
              ) : (
                <Text>Authenticated as {connection.login}</Text>
              )}
              <Badge
                color={
                  connection.status === "connected"
                    ? "emerald"
                    : connection.status === "error"
                      ? "red"
                      : connection.status === "syncing"
                        ? "blue"
                        : "zinc"
                }
              >
                {connection.status}
              </Badge>
            </div>
            <Text>
              Last successful sync:{" "}
              {connection.lastSyncedAt
                ? new Date(connection.lastSyncedAt).toLocaleString()
                : "Not yet"}
            </Text>
            <Text>
              Last webhook:{" "}
              {connection.lastWebhookAt
                ? new Date(connection.lastWebhookAt).toLocaleString()
                : "Not yet"}
            </Text>
            {connection.lastError && (
              <p role="status" className="text-sm text-red-600 dark:text-red-400">
                {connection.lastError}
              </p>
            )}
          </div>
          {!connection.webhookId && (
            <fetcher.Form method="post" className="mt-6 space-y-4">
              <input type="hidden" name="intent" value="connect" />
              <input type="hidden" name="connectionId" value={connection.id} />
              <Field>
                <Label>Repository</Label>
                {connection.repositoryId ? (
                  <>
                    <Text>
                      {connection.owner}/{connection.name}
                    </Text>
                    <input type="hidden" name="repositoryId" value={connection.repositoryId} />
                  </>
                ) : (
                  <Select
                    name="repositoryId"
                    required
                    disabled={busy || !setup.ready || !repositories.length}
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Select a repository
                    </option>
                    {repositories.map((repo) => (
                      <option key={repo.id} value={repo.id}>
                        {repo.fullName}
                      </option>
                    ))}
                  </Select>
                )}
                <FieldError name="repositoryId" actionData={fetcher.data} />
              </Field>
              <Button type="submit" disabled={busy || !setup.ready}>
                Connect
              </Button>
            </fetcher.Form>
          )}
          <div className="mt-6 flex gap-3">
            {connection.webhookId && (
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="sync" />
                <input type="hidden" name="connectionId" value={connection.id} />
                <Button
                  type="submit"
                  disabled={busy || !setup.ready || connection.status === "syncing"}
                >
                  Sync now
                </Button>
              </fetcher.Form>
            )}
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="disconnect" />
              <input type="hidden" name="connectionId" value={connection.id} />
              <Button outline type="submit" disabled={busy}>
                Disconnect
              </Button>
            </fetcher.Form>
          </div>
          <div className="mt-8 border-t border-zinc-950/10 pt-6 dark:border-white/10">
            {tokenForm("replace")}
          </div>
        </>
      )}
      <Text className="mt-6">
        GitHub remains the source of truth. Use Sync now to recover updates missed during downtime.
      </Text>
    </div>
  );
}
