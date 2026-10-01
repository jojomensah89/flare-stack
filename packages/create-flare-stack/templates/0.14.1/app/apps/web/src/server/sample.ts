import { logRequestEvent } from "@repo/observability";
import { createServerFn } from "@tanstack/react-start";

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
