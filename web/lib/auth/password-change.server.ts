import { changeUserPassword, getUserCredentialsById } from "~/db/repositories/users";
import { checkAuthRateLimit } from "../rate-limit.server";
import { hashPassword, verifyPassword } from "./password.server";

export async function changePassword(
  userId: number,
  organizationId: number,
  currentPassword: string,
  password: string,
) {
  const rateLimit = await checkAuthRateLimit({
    action: "password-change",
    account: String(userId),
  });
  if (!rateLimit.allowed) {
    return { status: "rate-limited", retryAfterSeconds: rateLimit.retryAfterSeconds } as const;
  }
  const credentials = await getUserCredentialsById(userId, organizationId);
  if (
    !credentials?.passwordHash ||
    !(await verifyPassword(currentPassword, credentials.passwordHash))
  ) {
    return { status: "invalid" } as const;
  }
  const passwordHash = await hashPassword(password);
  const changed = await changeUserPassword(
    userId,
    organizationId,
    credentials.passwordHash,
    passwordHash,
  );
  return { status: changed ? "success" : "conflict" } as const;
}
