import { items, withDb } from "@repo/db/neon";
import { logRequestEvent } from "@repo/observability";
import { createServerFn } from "@tanstack/react-start";
import { env, waitUntil } from "cloudflare:workers";
import { getServerClient } from "../lib/server-client";

type NeonWorkerEnvironment = {
  DATABASE_URL?: string;
};

function getDatabaseUrl() {
  const databaseUrl =
    (env as unknown as NeonWorkerEnvironment).DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Neon DATABASE_URL is required for database access");
  }
  return databaseUrl;
}

export const getServerStatus = createServerFn({ method: "GET" }).handler(async () => ({
  status: "healthy",
  runtime: "Cloudflare Workers",
  framework: "TanStack Start",
  timestamp: new Date().toISOString(),
}));

export const getDbItems = createServerFn({ method: "GET" }).handler(async () => {
  const startedAt = Date.now();
  return withDb({ DATABASE_URL: getDatabaseUrl() }, { waitUntil }, async (db) => {
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
    const item = {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date(),
    };
    return withDb({ DATABASE_URL: getDatabaseUrl() }, { waitUntil }, async (db) => {
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
  });

export const getServerBackendItems = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const client = getServerClient();
    const res = await client.api.items.$get();
    if (!res.ok) {
      return { ok: false, error: "Failed to fetch backend items via RPC", items: [] };
    }
    const data = await res.json();
    return { ok: true, items: data.items };
  } catch (error) {
    return { ok: false, error: String(error), items: [] };
  }
});
