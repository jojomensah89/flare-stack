import { logStructuredError, EVLOG_REDACTION } from "@repo/observability";
import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { initWorkersLogger, withEvlog } from "evlog/workers";
import { applySecurityHeaders, requireFlareEnvironment } from "./security";

type AppRuntimeBindings = {
  FLARE_ENVIRONMENT?: string;
};

initWorkersLogger({
  env: { service: "flare-reference-web" },
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
