import type { ReactNode } from "react";
import { useFetcher } from "react-router";
import { FieldError } from "~/web/components/field-error";
import { FormError } from "~/web/components/form-error";
import { Button } from "~/web/components/ui-kit/button";
import { Field, Label } from "~/web/components/ui-kit/fieldset";
import { Subheading } from "~/web/components/ui-kit/heading";
import { Input } from "~/web/components/ui-kit/input";
import { Text } from "~/web/components/ui-kit/text";
import type { AvatarUser } from "~/web/components/user-avatar";
import type { AccountActionData } from "./index";

export function SettingsRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="grid grid-cols-1 gap-6 py-8 sm:grid-cols-2 sm:gap-8" aria-label={title}>
      <div>
        <Subheading>{title}</Subheading>
        <Text className="mt-1">{description}</Text>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function SuccessMessage({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="text-sm/6 text-green-700 dark:text-green-400">
      {children}
    </p>
  );
}

export function PersonalDetailsForm({ user }: { user: AvatarUser }) {
  const fetcher = useFetcher<AccountActionData>();
  const busy = fetcher.state !== "idle";
  return (
    <fetcher.Form
      method="post"
      action="/account"
      className="border-b border-zinc-950/10 dark:border-white/10"
    >
      <input type="hidden" name="intent" value="profile" />
      <SettingsRow title="Personal details" description="Your name appears in your account menu.">
        <div className="space-y-6">
          <FormError actionData={fetcher.data} />
          <Field>
            <Label>First name</Label>
            <Input
              name="firstName"
              autoComplete="given-name"
              defaultValue={user.firstName ?? ""}
              maxLength={100}
              required
              invalid={!!fetcher.data?.fieldErrors?.firstName}
            />
            <FieldError name="firstName" actionData={fetcher.data} />
          </Field>
          <Field>
            <Label>Last name</Label>
            <Input
              name="lastName"
              autoComplete="family-name"
              defaultValue={user.lastName ?? ""}
              maxLength={100}
              invalid={!!fetcher.data?.fieldErrors?.lastName}
            />
            <FieldError name="lastName" actionData={fetcher.data} />
          </Field>
          <Field>
            <Label>Email address</Label>
            <Input type="email" value={user.email} readOnly autoComplete="email" />
          </Field>
          {fetcher.data?.success && !busy && (
            <SuccessMessage>Your details have been saved.</SuccessMessage>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </SettingsRow>
    </fetcher.Form>
  );
}

export function PasswordForm() {
  const fetcher = useFetcher<AccountActionData>();
  const busy = fetcher.state !== "idle";
  return (
    <fetcher.Form method="post" action="/account">
      <input type="hidden" name="intent" value="password" />
      <SettingsRow
        title="Password"
        description="Changing your password signs you out. Other devices will be signed out within 15 minutes."
      >
        <div className="space-y-6">
          <FormError actionData={fetcher.data} />
          <Field>
            <Label>Current password</Label>
            <Input
              type="password"
              name="currentPassword"
              autoComplete="current-password"
              required
              invalid={!!fetcher.data?.fieldErrors?.currentPassword}
            />
            <FieldError name="currentPassword" actionData={fetcher.data} />
          </Field>
          <Field>
            <Label>New password</Label>
            <Input
              type="password"
              name="password"
              autoComplete="new-password"
              required
              minLength={8}
              invalid={!!fetcher.data?.fieldErrors?.password}
            />
            <Text className="mt-2">Use at least 8 characters.</Text>
            <FieldError name="password" actionData={fetcher.data} />
          </Field>
          <Field>
            <Label>Confirm new password</Label>
            <Input
              type="password"
              name="confirmPassword"
              autoComplete="new-password"
              required
              invalid={!!fetcher.data?.fieldErrors?.confirmPassword}
            />
            <FieldError name="confirmPassword" actionData={fetcher.data} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>
              {busy ? "Changing…" : "Change password"}
            </Button>
          </div>
        </div>
      </SettingsRow>
    </fetcher.Form>
  );
}
