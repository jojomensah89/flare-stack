import { createDb, items } from "@repo/db";
import { logRequestEvent } from "@repo/observability";
import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";

export const getServerStatus = createServerFn({ method: "GET" }).handler(async () => ({
  status: "healthy",
  runtime: "Cloudflare Workers",
  framework: "TanStack Start",
  timestamp: new Date().toISOString(),
}));

export const getDbItems = createServerFn({ method: "GET" }).handler(async () => {
  const startedAt = Date.now();
  const db = createDb((env as unknown as Cloudflare.Env).DB);
  const result = await db.select().from(items);

  logRequestEvent({
    requestId: crypto.randomUUID(),
    method: "GET",
    path: "/server/db-items",
    status: 200,
    outcome: "success",
    durationMs: Date.now() - startedAt,
  });

  return result;
});

export const addDbItem = createServerFn({ method: "POST" })
  .validator((value: string) => {
    const name = value.trim();
    if (!name || name.length > 120) {
      throw new Error("Item names must contain between 1 and 120 characters.");
    }
    return name;
  })
  .handler(async ({ data: name }) => {
    const startedAt = Date.now();
    const db = createDb((env as unknown as Cloudflare.Env).DB);
    const item = {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date(),
    };
    await db.insert(items).values(item);

    logRequestEvent({
      requestId: crypto.randomUUID(),
      method: "POST",
      path: "/server/db-items",
      status: 201,
      outcome: "success",
      durationMs: Date.now() - startedAt,
    });

    return item;
  });
