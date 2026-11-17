import { defineConfig } from "drizzle-kit";
import { readEnvironment } from "../runtime/env.server";
import { controlDatabaseEnvSchema } from "./db/config";

const env = readEnvironment(controlDatabaseEnvSchema);
export default defineConfig({
  schema: "./control/db/schema/*.ts",
  out: "./control/db/drizzle",
  dialect: "postgresql",
  dbCredentials: { url: env.CONTROL_DATABASE_URL },
});
