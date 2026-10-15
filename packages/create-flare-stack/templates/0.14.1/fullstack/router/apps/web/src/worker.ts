import { logStructuredError } from "@repo/observability";
import { applySecurityHeaders, requireFlareEnvironment } from "./security";

type Fetcher = { fetch(request: Request): Promise<Response> };
type Bindings = {
  FLARE_ENVIRONMENT?: string;
  SERVER?: Fetcher;
  ASSETS: Fetcher;
};

function requestIdFrom(request: Request): string {
  const candidate = request.headers.get("cf-ray") ?? request.headers.get("x-request-id");
  return candidate && /^[A-Za-z0-9._:-]{1,128}$/.test(candidate) ? candidate : crypto.randomUUID();
}

function requestWithId(request: Request, requestId: string): Request {
  if (request.headers.get("x-request-id") === requestId) return request;
  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);
  const init: RequestInit & { duplex?: "half" } = { headers };
  if (request.body && request.method !== "GET" && request.method !== "HEAD") init.duplex = "half";
  return new Request(request, init);
}

export default {
  async fetch(request: Request, bindings: Bindings): Promise<Response> {
    const requestId = requestIdFrom(request);
    let environment;
    try {
      environment = requireFlareEnvironment(bindings.FLARE_ENVIRONMENT);
    } catch (error) {
      logStructuredError(error, { operation: "worker.environment", requestId });
      return applySecurityHeaders(
        Response.json(
          {
            error: {
              code: "WORKER_ENVIRONMENT",
              message: "Worker environment is not configured.",
            },
            requestId,
          },
          { status: 500 },
        ),
        "production",
        requestId,
      );
    }

    const url = new URL(request.url);
    try {
      if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
        if (!bindings.SERVER?.fetch) {
          return applySecurityHeaders(
            Response.json(
              {
                error: { code: "SERVER_UNAVAILABLE", message: "The API server is unavailable." },
                requestId,
              },
              { status: 503 },
            ),
            environment,
            requestId,
          );
        }
        const response = await bindings.SERVER.fetch(requestWithId(request, requestId));
        return applySecurityHeaders(response, environment, requestId);
      }
      return applySecurityHeaders(await bindings.ASSETS.fetch(request), environment, requestId);
    } catch (error) {
      logStructuredError(error, { operation: "worker.request", requestId });
      return applySecurityHeaders(
        Response.json(
          {
            error: { code: "INTERNAL_ERROR", message: "The request could not be completed." },
            requestId,
          },
          { status: 500 },
        ),
        environment,
        requestId,
      );
    }
  },
};
