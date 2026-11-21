import { timingSafeEqual } from "node:crypto";
import { runnerSecretSchema } from "~/control/runner-protocol";
import { env } from "~/web/env.server";

export function configuredRunnerOrganization() {
  return env.CONTROL_RUNNER_SECRET && typeof env.CONTROL_RUNNER_ORGANIZATION_ID === "number"
    ? env.CONTROL_RUNNER_ORGANIZATION_ID
    : undefined;
}

export function authorizedRunnerOrganization(request: Request) {
  const authorization = request.headers.get("authorization");
  const supplied = runnerSecretSchema.safeParse(authorization?.match(/^Bearer (.+)$/i)?.[1]);
  const expected = env.CONTROL_RUNNER_SECRET;
  if (
    !expected ||
    !supplied.success ||
    !timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(supplied.data, "hex"))
  )
    return undefined;
  return configuredRunnerOrganization();
}
