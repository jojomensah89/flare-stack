import { logStructuredError } from "@repo/observability";
import { Hono } from "hono";
import { handleAuthRequest } from "../service-tags";
import { runEffect } from "../run-effect";
import { makeAuthLayer, validateServerAuthRequestOrigin } from "../auth";
import { ServerAuthOriginError } from "../auth/config";
import type { ServerEnv } from "../env";

export const authRoutes = new Hono<ServerEnv>().all("/*", async (c) => {
  const requestId = c.get("requestId");
  try {
    validateServerAuthRequestOrigin(c.req.raw, c.env);
  } catch (error) {
    if (error instanceof ServerAuthOriginError) {
      return c.json(
        {
          error: { code: "INVALID_ORIGIN", message: "The request origin is not allowed." },
          requestId,
        },
        403,
      );
    }
    logStructuredError(error, { operation: "auth.origin_validation", requestId });
    return c.json(
      {
        error: { code: "AUTH_CONFIGURATION", message: "Authentication is unavailable." },
        requestId,
      },
      500,
    );
  }

  const result = await runEffect(handleAuthRequest(c.req.raw), makeAuthLayer(c.env), requestId);
  if (!result.ok) {
    return c.json(
      { error: { code: result.failure.code, message: result.failure.message }, requestId },
      result.failure.status,
    );
  }
  return result.value;
});
