import type { Fetcher } from "@cloudflare/workers-types";
import { EVLOG_REDACTION, logStructuredError } from "@repo/observability";
import { app as serverApp } from "@repo/server";
import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { initWorkersLogger, withEvlog } from "evlog/workers";
import { applySecurityHeaders, requireFlareEnvironment } from "./security";

type AppRuntimeBindings = {
  FLARE_ENVIRONMENT?: string;
  SERVER?: Fetcher;
  [key: string]: unknown;
};

initWorkersLogger({
  env: { service: "{{PROJECT_NAME}}-web" },
  pretty: false,
  stringify: false,
  redact: EVLOG_REDACTION,
});

const handleStartRequest = createStartHandler(defaultStreamHandler);

function requestIdFrom(request: Request): string {
  const candidate = request.headers.get("cf-ray") ?? request.headers.get("x-request-id");
  if (candidate && /^[A-Za-z0-9._:-]{1,128}$/.test(candidate)) {
    return candidate;
  }
  return crypto.randomUUID();
}

function requestWithId(request: Request, requestId: string): Request {
  if (request.headers.get("x-request-id") === requestId) {
    return request;
  }
  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);
  const init: RequestInit & { duplex?: "half" } = { headers };
  if (request.body && request.method !== "GET" && request.method !== "HEAD") {
    init.duplex = "half";
  }
  return new Request(request, init);
}

const worker = withEvlog<AppRuntimeBindings>(
  async (request, bindings, _context, logger) => {
    const requestId = requestIdFrom(request);
    let environment;
    try {
      environment = requireFlareEnvironment(bindings.FLARE_ENVIRONMENT);
    } catch (error) {
      logStructuredError(error, { operation: "worker.environment", requestId });
      return applySecurityHeaders(
        Response.json({ error: "Worker environment is not configured" }, { status: 500 }),
        "production",
        requestId,
      );
    }

    logger.set({ requestId, environment });
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) {
        const isAuthRoute = url.pathname === "/api/auth" || url.pathname.startsWith("/api/auth/");
        if (bindings.SERVER?.fetch) {
          const forwardReq = requestWithId(request, requestId);
          const response = await bindings.SERVER.fetch(forwardReq as any);
          return applySecurityHeaders(response as unknown as Response, environment, requestId);
        }

        if (!isAuthRoute) {
          const forwardReq = requestWithId(request, requestId);
          const response = await serverApp.fetch(forwardReq, bindings as any);
          return applySecurityHeaders(response, environment, requestId);
        }
      }

      const response = await handleStartRequest(request);
      return applySecurityHeaders(response, environment, requestId);
    } catch (error) {
      logStructuredError(error, { operation: "worker.request", requestId });
      return applySecurityHeaders(
        Response.json({ error: "Internal Server Error" }, { status: 500 }),
        environment,
        requestId,
      );
    }
  },
  { redact: EVLOG_REDACTION },
);

export default worker;
