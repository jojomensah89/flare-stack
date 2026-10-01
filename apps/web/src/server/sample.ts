import { env } from "cloudflare:workers";
import { createDb, items } from "@repo/db";
import { createServerFn } from "@tanstack/react-start";

export const getServerStatus = createServerFn({ method: "GET" }).handler(async () => {
  return {
    status: "healthy",
    runtime: "Cloudflare Workers",
    framework: "TanStack Start",
    timestamp: new Date().toISOString(),
    preset: "app",
    database: "d1",
  };
});

export const getDbItems = createServerFn({ method: "GET" }).handler(async () => {
  const d1 = (env as unknown as Cloudflare.Env)?.DB;
  if (!d1) {
    return { ok: false, error: "D1 database binding not found", items: [] };
  }
  const db = createDb(d1);
  const list = await db.select().from(items);

  return { ok: true, items: list };
});

export const addDbItem = createServerFn({ method: "POST" })
  .validator((d: string) => d)
  .handler(async ({ data: name }) => {
    const d1 = (env as unknown as Cloudflare.Env)?.DB;
    if (!d1) {
      return { ok: false, error: "D1 database binding not found" };
    }
    const db = createDb(d1);
    const newItem = {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date(),
    };
    await db.insert(items).values(newItem);

    return { ok: true, item: newItem };
  });
