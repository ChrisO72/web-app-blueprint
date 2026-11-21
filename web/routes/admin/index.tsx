import { useState } from "react";
import { useFetcher } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/index";
import { requireAdmin } from "~/web/lib/session.server";
import { getSiteSettings, updateSiteSettings } from "~/db/repositories/settings";
import { Heading } from "~/web/components/ui-kit/heading";
import { SettingsRow } from "~/web/components/settings-row";
import { Field, Label } from "~/web/components/ui-kit/fieldset";
import { Input } from "~/web/components/ui-kit/input";
import { Button } from "~/web/components/ui-kit/button";
import { Switch } from "~/web/components/ui-kit/switch";
import { Badge } from "~/web/components/ui-kit/badge";
import { XMarkIcon } from "@heroicons/react/16/solid";
import type { ActionData, FieldErrors } from "~/web/lib/form";
import { isEmailConfigured } from "~/integrations/mail/client.server";
import { useFetcherToast } from "~/web/lib/use-fetcher-toast";

const settingsSchema = z.object({
  allowedDomains: z.array(z.string().trim().min(1)).default([]),
  signupEnabled: z.boolean().default(false),
  requireMailConfirmation: z.boolean().default(false),
});

export async function loader({ context }: Route.LoaderArgs) {
  requireAdmin(context);
  const settings = await getSiteSettings();
  return { settings, isEmailConfigured };
}

export async function action({ request, context }: Route.ActionArgs): Promise<ActionData> {
  requireAdmin(context);

  const formData = await request.formData();

  const domains = formData.getAll("allowedDomains").map((v) => String(v));
  const signupEnabled = formData.get("signupEnabled") === "true";
  const requireMailConfirmation =
    isEmailConfigured && formData.get("requireMailConfirmation") === "true";

  const result = settingsSchema.safeParse({
    allowedDomains: domains,
    signupEnabled,
    requireMailConfirmation,
  });
  if (!result.success) {
    return { fieldErrors: z.flattenError(result.error).fieldErrors as FieldErrors };
  }

  await updateSiteSettings(result.data);
  return {};
}

export default function AdminSettingsPage({ loaderData }: Route.ComponentProps) {
  const { settings, isEmailConfigured } = loaderData;
  const fetcher = useFetcher<typeof action>();
  useFetcherToast(fetcher, { success: "Settings saved" });

  const [domains, setDomains] = useState<string[]>(settings.allowedDomains ?? []);
  const [domainInput, setDomainInput] = useState("");
  const [signupEnabled, setSignupEnabled] = useState(settings.signupEnabled);
  const [mailConfirmation, setMailConfirmation] = useState(
    isEmailConfigured && settings.requireMailConfirmation,
  );

  const addDomain = () => {
    const value = domainInput.trim().toLowerCase();
    if (value && !domains.includes(value)) {
      setDomains([...domains, value]);
    }
    setDomainInput("");
  };

  const removeDomain = (domain: string) => {
    setDomains(domains.filter((d) => d !== domain));
  };

  const isSaving = fetcher.state !== "idle";

  return (
    <div className="max-w-4xl">
      <Heading>Settings</Heading>

      <fetcher.Form method="PUT" className="mt-6 border-t border-zinc-950/10 dark:border-white/10">
        <div className="divide-y divide-zinc-950/10 dark:divide-white/10">
          <SettingsRow
            title="Allowed signup domains"
            description="Only users with email addresses from these domains can create an account. Leave empty to allow all domains."
          >
            <Field>
              <Label className="sr-only">Allowed signup domains</Label>

              <div className="flex gap-2">
                <Input
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addDomain();
                    }
                  }}
                  placeholder="example.com"
                  className="flex-1"
                />
                <Button type="button" onClick={addDomain} outline>
                  Add
                </Button>
              </div>

              {domains.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {domains.map((domain) => (
                    <Badge key={domain} color="zinc">
                      {domain}
                      <button
                        type="button"
                        onClick={() => removeDomain(domain)}
                        className="-mr-0.5 ml-1 inline-flex items-center"
                      >
                        <XMarkIcon className="size-3.5" />
                      </button>
                      <input type="hidden" name="allowedDomains" value={domain} />
                    </Badge>
                  ))}
                </div>
              )}
            </Field>
          </SettingsRow>

          <SettingsRow title="Enable signup" description="Allow new users to create an account.">
            <Switch
              aria-label="Enable signup"
              name="signupEnabled"
              checked={signupEnabled}
              onChange={setSignupEnabled}
              color="dark/zinc"
            />
            <input type="hidden" name="signupEnabled" value={String(signupEnabled)} />
          </SettingsRow>

          <SettingsRow
            title="Require mail confirmation"
            description={
              <>
                New users must confirm their email address before they can sign in.
                {!isEmailConfigured && (
                  <span className="mt-1 block">
                    If the Lettermint environment variables are set, the app can send emails. Email
                    is used for account confirmation and password resets.
                  </span>
                )}
              </>
            }
          >
            <Switch
              aria-label="Require mail confirmation"
              name="requireMailConfirmation"
              checked={mailConfirmation}
              onChange={setMailConfirmation}
              color="dark/zinc"
              disabled={!isEmailConfigured}
            />
            <input type="hidden" name="requireMailConfirmation" value={String(mailConfirmation)} />
          </SettingsRow>
        </div>

        <div className="flex justify-end border-t border-zinc-950/10 py-8 dark:border-white/10">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </fetcher.Form>
    </div>
  );
}
