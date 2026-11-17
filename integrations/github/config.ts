import { z } from "zod";
import { optionalString } from "~/runtime/config";

export const githubEnvSchema = z.object({
  CONTROL_ENCRYPTION_KEY: optionalString,
  APP_URL: optionalString,
});
