import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

export function createDb(connectionStringOrPool: string | Pool) {
  const pool =
    typeof connectionStringOrPool === "string"
      ? new Pool({ connectionString: connectionStringOrPool })
      : connectionStringOrPool;
  return drizzle(pool, { schema });
}

export type NeonDatabase = ReturnType<typeof createDb>;

export type ExecutionContext = {
  waitUntil: (promise: Promise<unknown>) => void;
};

export async function withDb<T>(
  env: { DATABASE_URL: string },
  ctx: ExecutionContext,
  run: (db: NeonDatabase) => Promise<T>,
): Promise<T> {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  try {
    return await run(db);
  } finally {
    ctx.waitUntil(pool.end());
  }
}
