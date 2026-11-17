import { cpSync, mkdirSync, rmSync } from "node:fs";
import { build } from "esbuild";

rmSync("build/control/db", { recursive: true, force: true });
mkdirSync("build/control/db", { recursive: true });
await build({
  entryPoints: ["control/db/migrate.ts"],
  outfile: "build/control/db/migrate.js",
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
});
cpSync("control/db/drizzle", "build/control/db/drizzle", { recursive: true });
