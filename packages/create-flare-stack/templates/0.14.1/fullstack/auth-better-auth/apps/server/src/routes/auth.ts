import { Hono } from "hono";
import { logStructuredError } from "@repo/observability";
import { getAuth, validateServerAuthRequestOrigin } from "../auth";
import { ServerAuthOriginError } from "../auth/config";
import type { ServerEnv } from "../env";

export const authRoutes = new Hono<ServerEnv>().all("/*", async (c) => {
  try {
    validateServerAuthRequestOrigin(c.req.raw, c.env);
  } catch (error) {
    if (error instanceof ServerAuthOriginError) {
      return c.json({ error: "Invalid request origin" }, 403);
    }
    logStructuredError(error, { operation: "auth.origin_validation" });
    return c.json({ error: "Authentication is not configured" }, 500);
  }

  try {
    return await getAuth(c.env).handler(c.req.raw);
  } catch (error) {
    logStructuredError(error, { operation: "auth.handler" });
    return c.json({ error: "Authentication request failed" }, 500);
  }
});
