import { z } from "zod";

export const controlDatabaseEnvSchema = z.object({ CONTROL_DATABASE_URL: z.url() });
