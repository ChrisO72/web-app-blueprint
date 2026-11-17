import { readEnvironment } from "~/runtime/env.server";
import { controlDatabaseEnvSchema } from "./config";
export const env = readEnvironment(controlDatabaseEnvSchema);
