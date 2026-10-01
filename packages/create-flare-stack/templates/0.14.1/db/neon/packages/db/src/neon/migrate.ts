import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL environment variable is required.");
    process.exit(1);
  }

  const currentDir = dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = resolve(currentDir, "migrations");
  if (!existsSync(migrationsFolder)) {
    console.error(`Migrations folder not found at ${migrationsFolder}`);
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder });
    console.log("Neon migrations applied successfully.");
  } catch (error) {
    console.error(`Failed to apply Neon migrations: ${String(error)}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

await main();
