import { Pool } from "@neondatabase/serverless";
import { desc } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { createDb, items } from "@repo/db/neon";
import type { ServerBindings } from "./env";
import { ItemStore, ItemStoreError, type Item } from "./service-tags";
export { createItem, handleAuthRequest, listItems } from "./service-tags";

function toDto(row: typeof items.$inferSelect): Item {
  return { id: row.id, name: row.name, createdAt: row.createdAt.toISOString() };
}

export function makeItemStoreLayer(bindings: ServerBindings): Layer.Layer<ItemStore> {
  const acquirePool = Effect.acquireRelease(
    Effect.sync(() => new Pool({ connectionString: bindings.DATABASE_URL })),
    (pool) => Effect.promise(() => pool.end()),
  );

  return Layer.scoped(
    ItemStore,
    Effect.map(acquirePool, (pool) => {
      const db = createDb(pool);
      return {
        list: () =>
          Effect.tryPromise({
            try: async () =>
              (await db.select().from(items).orderBy(desc(items.createdAt))).map(toDto),
            catch: (cause) => new ItemStoreError(cause),
          }),
        create: (name) =>
          Effect.tryPromise({
            try: async () => {
              const [row] = await db
                .insert(items)
                .values({ id: crypto.randomUUID(), name, createdAt: new Date() })
                .returning();
              if (!row) throw new Error("The database did not return the created item");
              return toDto(row);
            },
            catch: (cause) => new ItemStoreError(cause),
          }),
      };
    }),
  );
}
