import { z } from "zod";
import { redirect } from "react-router";
import { updateUserProfile } from "~/db/repositories/users";
import { isFileStorageEnabled } from "~/integrations/storage/objects.server";
import { log } from "~/telemetry/log.server";
import { Heading } from "~/web/components/ui-kit/heading";
import { Text } from "~/web/components/ui-kit/text";
import {
  prepareAvatar,
  confirmAvatar,
  removeAvatar,
  failAvatar,
} from "~/web/lib/account-avatar.server";
import { AVATAR_CONTENT_TYPES, MAX_AVATAR_BYTES } from "~/web/lib/avatar";
import { changePassword } from "~/web/lib/auth/password-change.server";
import { type ActionData, parseForm } from "~/web/lib/form";
import { createRateLimitResponse } from "~/web/lib/rate-limit.server";
import { clearAuthCookies, requireRegistered } from "~/web/lib/session.server";
import type { Route } from "./+types/index";
import { PersonalDetailsForm, PasswordForm } from "./account-forms";
import { ProfilePhotoForm } from "./profile-photo-form";

const intentSchema = z.object({
  intent: z.enum([
    "profile",
    "password",
    "avatar-prepare",
    "avatar-confirm",
    "avatar-fail",
    "avatar-remove",
  ]),
});
const profileSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, "First name is required")
    .max(100, "First name must be 100 characters or fewer"),
  lastName: z.string().trim().max(100, "Last name must be 100 characters or fewer"),
});
const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine(({ password, confirmPassword }) => password === confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
const prepareSchema = z.object({
  filename: z.string().trim().min(1, "Choose a photo").max(255, "Filename is too long"),
  contentType: z.enum(AVATAR_CONTENT_TYPES, { message: "Choose a JPEG, PNG, or WebP image" }),
  size: z.coerce
    .number()
    .int()
    .min(1, "The photo is empty")
    .max(MAX_AVATAR_BYTES, "Photos must be 5 MiB or smaller"),
});
const fileIdSchema = z.object({ fileId: z.coerce.number().int().positive("Invalid photo upload") });

export type AccountActionData = ActionData & {
  intent?: z.infer<typeof intentSchema>["intent"];
  success?: boolean;
  prepared?: { fileId: number; url: string; fields: Record<string, string> };
};

export function loader({ context }: Route.LoaderArgs) {
  return { user: requireRegistered(context), storageEnabled: isFileStorageEnabled };
}

export async function action({
  request,
  context,
}: Route.ActionArgs): Promise<AccountActionData | Response> {
  const user = requireRegistered(context);
  if (request.method !== "POST") throw new Response("Method not allowed", { status: 405 });
  const formData = await request.formData();
  const parsedIntent = parseForm(formData, intentSchema);
  if (parsedIntent.fieldErrors) return { formError: "Unknown account action." };
  const { intent } = parsedIntent.data;

  if (intent === "profile") {
    const { data, fieldErrors } = parseForm(formData, profileSchema);
    if (fieldErrors) return { intent, fieldErrors };
    const updated = await updateUserProfile(user.id, user.organizationId, {
      firstName: data.firstName,
      lastName: data.lastName || null,
    });
    return updated
      ? { intent, success: true }
      : { intent, formError: "Your details could not be saved. Please try again." };
  }

  if (intent === "password") {
    const { data, fieldErrors } = parseForm(formData, passwordSchema);
    if (fieldErrors) return { intent, fieldErrors };
    const result = await changePassword(
      user.id,
      user.organizationId,
      data.currentPassword,
      data.password,
    );
    if (result.status === "rate-limited") return createRateLimitResponse(result.retryAfterSeconds);
    if (result.status === "invalid")
      return { intent, fieldErrors: { currentPassword: ["Your current password is incorrect."] } };
    if (result.status === "conflict")
      return {
        intent,
        formError: "Your password changed during this request. Please sign in again.",
      };
    const cookies = await clearAuthCookies();
    return redirect("/login?passwordChanged=success", {
      headers: cookies.map((cookie) => ["Set-Cookie", cookie] as [string, string]),
    });
  }

  if (!isFileStorageEnabled)
    return { intent, formError: "Profile photos are currently unavailable." };
  try {
    if (intent === "avatar-prepare") {
      const { data, fieldErrors } = parseForm(formData, prepareSchema);
      if (fieldErrors) return { intent, fieldErrors };
      return {
        intent,
        prepared: await prepareAvatar(user, data.filename, data.contentType, data.size),
      };
    }
    if (intent === "avatar-remove") {
      const removed = await removeAvatar(user);
      return removed
        ? { intent, success: true }
        : { intent, formError: "Your photo changed during this request. Please try again." };
    }
    const { data, fieldErrors } = parseForm(formData, fileIdSchema);
    if (fieldErrors) return { intent, fieldErrors };
    const success =
      intent === "avatar-confirm"
        ? await confirmAvatar(user, data.fileId)
        : await failAvatar(user, data.fileId);
    return success
      ? { intent, success: true }
      : { intent, formError: "This photo upload could not be confirmed. Please try again." };
  } catch (error) {
    log.error("Account photo update failed", error);
    return { intent, formError: "Your photo could not be updated. Please try again." };
  }
}

export default function AccountPage({ loaderData }: Route.ComponentProps) {
  const { user, storageEnabled } = loaderData;
  return (
    <div className="max-w-4xl">
      <Heading>My account</Heading>
      <Text className="mt-2">Manage your profile and password.</Text>
      <div className="mt-6 border-t border-zinc-950/10 dark:border-white/10">
        <ProfilePhotoForm user={user} storageEnabled={storageEnabled} />
        <PersonalDetailsForm user={user} />
        <PasswordForm />
      </div>
    </div>
  );
}
