import { isAbsolute } from "node:path";
import { z } from "zod";
import { runnerSecretSchema } from "../runner-protocol";

const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const runnerConfigSchema = z.object({
  CONTROL_RUNNER_URL: z.string().refine((value) => {
    const url = URL.parse(value);
    if (!url || url.username || url.password) return false;
    return (
      url.protocol === "https:" || (url.protocol === "http:" && loopbackHosts.has(url.hostname))
    );
  }, "Use HTTPS or an HTTP loopback address, without URL credentials."),
  CONTROL_RUNNER_SECRET: runnerSecretSchema,
  CONTROL_RUNNER_CHECKOUT: z.string().refine(isAbsolute),
});
