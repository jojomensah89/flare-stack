import { EVLOG_REDACTION, logStructuredError } from "@repo/observability";
import { initWorkersLogger, withEvlog } from "evlog/workers";
import { Hono } from "hono";
import type { ServerBindings, ServerEnv } from "./env";
import { healthRoutes } from "./routes/health";
import { itemRoutes } from "./routes/items";
import { authRoutes } from "./routes/auth";

function requestIdFrom(request: Request): string {
  const candidate = request.headers.get("cf-ray") ?? request.headers.get("x-request-id");
  if (candidate && /^[A-Za-z0-9._:-]{1,128}$/.test(candidate)) {
    return candidate;
  }
  return crypto.randomUUID();
}

const app = new Hono<ServerEnv>()
  .basePath("/api")
  .use("*", async (c, next) => {
    const requestId = requestIdFrom(c.req.raw);
    c.set("requestId", requestId);
    await next();
    c.header("x-request-id", requestId);
  })
  .onError((error, c) => {
    const requestId = c.get("requestId") ?? requestIdFrom(c.req.raw);
    logStructuredError(new Error("An API request defect occurred."), {
      operation: "server.request",
      requestId,
      defectType: error.name,
    });
    return c.json(
      {
        error: { code: "INTERNAL_ERROR", message: "The request could not be completed." },
        requestId,
      },
      500,
    );
  })
  .notFound((c) =>
    c.json(
      {
        error: { code: "NOT_FOUND", message: "The requested API resource was not found." },
        requestId: c.get("requestId"),
      },
      404,
    ),
  )
  .route("/health", healthRoutes)
  .route("/items", itemRoutes)
  .route("/auth", authRoutes);

initWorkersLogger({
  env: { service: "{{PROJECT_NAME}}-server" },
  pretty: false,
  stringify: false,
  redact: EVLOG_REDACTION,
});

const worker = withEvlog<ServerBindings>(
  async (request, bindings, _context, logger) => {
    try {
      const response = await app.fetch(request, bindings);
      const requestId = response.headers.get("x-request-id");
      if (requestId) {
        logger.set({ requestId });
      }
      return response;
    } catch (error) {
      const requestId = requestIdFrom(request);
      logger.set({ requestId });
      logStructuredError(error, { operation: "server.request", requestId });
      return Response.json(
        {
          error: { code: "INTERNAL_ERROR", message: "The request could not be completed." },
          requestId,
        },
        { status: 500, headers: { "x-request-id": requestId } },
      );
    }
  },
  { redact: EVLOG_REDACTION },
);

export { app };
export default worker;
