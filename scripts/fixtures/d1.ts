import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function createD1Fixture() {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const migrations = join(import.meta.dir, "../../packages/db/migrations");
  for (const file of readdirSync(migrations)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    sqlite.exec(readFileSync(join(migrations, file), "utf8"));
  }
  function prepare(query: string, values: unknown[] = []): D1PreparedStatement {
    const args = values as (string | number | boolean | null)[];
    return {
      bind: (...bound: unknown[]) => prepare(query, bound),
      async all() {
        return { results: sqlite.query(query).all(...args), success: true, meta: {} };
      },
      async run() {
        const result = sqlite.query(query).run(...args);
        return { results: [], success: true, meta: { changes: result.changes } };
      },
      async raw() {
        return sqlite.query(query).values(...args);
      },
      async first(column?: string) {
        const row = sqlite.query(query).get(...args) as Record<string, unknown> | null;
        return column && row ? row[column] : row;
      },
    } as unknown as D1PreparedStatement;
  }
  const binding = {
    prepare,
    async batch(statements: D1PreparedStatement[]) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.all());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    async exec(query: string) {
      sqlite.exec(query);
      return { count: 1, duration: 0 };
    },
    async dump() {
      return new ArrayBuffer(0);
    },
    withSession() {
      return this;
    },
  } as unknown as D1Database;
  return { sqlite, binding };
}
