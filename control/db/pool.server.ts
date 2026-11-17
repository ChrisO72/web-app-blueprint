import { registerCleanup } from "~/runtime/lifecycle.server";
import { Pool } from "pg";

const shared = globalThis as typeof globalThis & { __controlPool?: Pool };

export function getPool(connectionString: string) {
  if (!shared.__controlPool) {
    shared.__controlPool = new Pool({ connectionString, connectionTimeoutMillis: 10_000 });
    registerCleanup(closeDatabase);
  }
  return shared.__controlPool;
}

export async function closeDatabase() {
  const pool = shared.__controlPool;
  delete shared.__controlPool;
  await pool?.end();
}
