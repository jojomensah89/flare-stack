import type { Fetcher } from "@cloudflare/workers-types";
import { app as serverApp } from "@repo/server";
import type { AppType } from "@repo/server/contract";
import { hc } from "hono/client";

type ServerClientBindings = {
  SERVER?: Fetcher;
  [key: string]: unknown;
};

let workersEnv: ServerClientBindings = {};
try {
  const cf = await import("" + "cloudflare:workers");
  workersEnv = (cf.env as unknown as ServerClientBindings) || {};
} catch {
  workersEnv = (process.env as unknown as ServerClientBindings) || {};
}

/**
 * Returns a type-safe Hono RPC client for TanStack Start server functions.
 * When running inside Cloudflare Workers with a Service Binding, requests are forwarded
 * to the `SERVER` binding without network overhead.
 * When running in-process (e.g. tests or local fallback), it executes the Hono app directly.
 */
export function getServerClient(customBindings?: ServerClientBindings) {
  const bindings = customBindings ?? workersEnv;
  if (bindings?.SERVER?.fetch) {
    const serverFetcher = bindings.SERVER;
    return hc<AppType>("https://server.internal", {
      fetch: (input: string | URL | Request, init?: RequestInit) =>
        serverFetcher.fetch(input as any, init as any) as unknown as Promise<Response>,
    });
  }

  return hc<AppType>("https://server.internal", {
    fetch: (input: string | URL | Request, init?: RequestInit) =>
      serverApp.fetch(new Request(input, init), (bindings ?? {}) as any),
  });
}
