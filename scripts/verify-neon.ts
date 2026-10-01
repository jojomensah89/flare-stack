import assert from "node:assert/strict";
import { Pool } from "@neondatabase/serverless";
import { withDb } from "../packages/db/src/neon/client";

// Exercise the real helper without connecting or modifying any database.
const originalEnd = Object.getOwnPropertyDescriptor(Pool.prototype, "end");
const completed = new Set<Pool>();
const closed: Pool[] = [];
Pool.prototype.end = async function () {
  assert.ok(completed.has(this), "Cleanup must start after handler settlement");
  closed.push(this);
};
const pending: Promise<unknown>[] = [];
const ctx = {
  waitUntil: (promise: Promise<unknown>) => {
    pending.push(promise);
  },
};
const env = { DATABASE_URL: "postgresql://fixture:fixture@localhost/fixture" };
try {
  for (let request = 0; request < 2; request++) {
    const result = await withDb(env, ctx, async (db) => {
      const pool = (db as unknown as { $client: Pool }).$client;
      assert.ok(pool instanceof Pool);
      assert.ok(!closed.includes(pool), "Pool must remain open while handler runs");
      await Promise.resolve();
      completed.add(pool);
      return request;
    });
    assert.equal(result, request);
  }
  await assert.rejects(
    withDb(env, ctx, async (db) => {
      completed.add((db as unknown as { $client: Pool }).$client);
      throw new Error("fixture handler failure");
    }),
    /fixture handler failure/,
  );
  await Promise.all(pending);
  assert.equal(closed.length, 3);
  assert.equal(
    new Set(closed).size,
    3,
    "Requests must use distinct pools, including the error path",
  );
  console.log(
    "Neon helper fixture passed: real withDb distinct pools and cleanup after success/error. No database connection; deployed acceptance is deferred.",
  );
} finally {
  if (originalEnd) Object.defineProperty(Pool.prototype, "end", originalEnd);
  else Reflect.deleteProperty(Pool.prototype, "end");
}
