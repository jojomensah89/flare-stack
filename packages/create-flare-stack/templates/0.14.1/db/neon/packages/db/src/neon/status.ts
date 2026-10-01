import { Pool } from "@neondatabase/serverless";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL environment variable is required.");
    process.exit(1);
  }

  const currentDir = dirname(fileURLToPath(import.meta.url));
  const journalPath = resolve(currentDir, "migrations/meta/_journal.json");
  if (!existsSync(journalPath)) {
    console.error(`Migration journal not found at ${journalPath}`);
    process.exit(1);
  }

  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
    entries: Array<{ tag: string; when: number }>;
  };
  const expectedEntries = journal.entries ?? [];

  const pool = new Pool({ connectionString });
  try {
    const tableCheck = await pool.query(
      `SELECT to_regclass('drizzle.__drizzle_migrations') as regclass_drizzle, to_regclass('public.__drizzle_migrations') as regclass_public;`,
    );
    const regclass = tableCheck.rows[0]?.regclass_drizzle
      ? '"drizzle"."__drizzle_migrations"'
      : tableCheck.rows[0]?.regclass_public
        ? '"public"."__drizzle_migrations"'
        : null;

    const appliedTimestamps = new Set<number>();
    if (regclass) {
      const result = await pool.query(`SELECT created_at FROM ${regclass} ORDER BY id ASC;`);
      for (const row of result.rows) {
        if (row.created_at !== undefined && row.created_at !== null) {
          appliedTimestamps.add(Number(row.created_at));
        }
      }
    }

    const pending: string[] = [];
    for (const entry of expectedEntries) {
      if (!appliedTimestamps.has(entry.when)) {
        pending.push(`${entry.tag}.sql`);
      }
    }

    console.log(JSON.stringify({ pending }));
  } catch (error) {
    console.error(`Failed to read Neon migration status: ${String(error)}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

await main();
