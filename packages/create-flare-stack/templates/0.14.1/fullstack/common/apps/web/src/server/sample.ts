import { logRequestEvent } from "@repo/observability";
import { createServerFn } from "@tanstack/react-start";
import { getServerClient } from "../lib/server-client";

export const getServerStatus = createServerFn({ method: "GET" }).handler(async () => {
  const startedAt = Date.now();
  const status = {
    status: "healthy",
    runtime: "Cloudflare Workers",
    framework: "TanStack Start",
    timestamp: new Date().toISOString(),
  };

  logRequestEvent({
    requestId: crypto.randomUUID(),
    method: "GET",
    path: "/server/status",
    status: 200,
    outcome: "success",
    durationMs: Date.now() - startedAt,
  });

  return status;
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
