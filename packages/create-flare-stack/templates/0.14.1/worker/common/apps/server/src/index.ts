import { EVLOG_REDACTION, logStructuredError } from "@repo/observability";
import { initWorkersLogger, withEvlog } from "evlog/workers";
import { Hono } from "hono";
import type { ServerBindings, ServerEnv } from "./env";

function requestIdFrom(request: Request): string {
  const candidate = request.headers.get("cf-ray") ?? request.headers.get("x-request-id");
  if (candidate && /^[A-Za-z0-9._:-]{1,128}$/.test(candidate)) {
    return candidate;
  }
  return crypto.randomUUID();
}

const app = new Hono<ServerEnv>()
  .use("*", async (c, next) => {
    const requestId = requestIdFrom(c.req.raw);
    c.set("requestId", requestId);
    await next();
    c.header("x-request-id", requestId);
  })
  .get("/", (c) => {
    return c.json({ name: "{{PROJECT_NAME}}", status: "healthy" });
  })
  .get("/health", (c) => {
    return c.json({ ok: true });
  });

initWorkersLogger({
  env: { service: "{{PROJECT_NAME}}" },
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
      logStructuredError(error, { operation: "worker.request", requestId });
      return Response.json(
        { error: "Internal Server Error", requestId },
        { status: 500, headers: { "x-request-id": requestId } },
      );
    }
  },
  { redact: EVLOG_REDACTION },
);

export { app };
export default worker;
export type AppType = typeof app;
