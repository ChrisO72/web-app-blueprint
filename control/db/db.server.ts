import { drizzle } from "drizzle-orm/node-postgres";
import { readEnvironment } from "~/runtime/env.server";
import { controlDatabaseEnvSchema } from "./config";
import { getPool } from "./pool.server";

export function getDatabase() {
  const env = readEnvironment(controlDatabaseEnvSchema);
  return drizzle(getPool(env.CONTROL_DATABASE_URL));
}
