import { HealthResponseSchema } from "@repo/shared/api";
import { Hono } from "hono";
import { Effect, Layer } from "effect";
import { runEffect } from "../run-effect";
import type { ServerEnv } from "../env";

export const healthRoutes = new Hono<ServerEnv>().get("/", async (c) => {
  const requestId = c.get("requestId");
  const result = await runEffect(Effect.succeed({ ok: true as const }), Layer.empty, requestId);
  if (!result.ok)
    return c.json(
      { error: { code: result.failure.code, message: result.failure.message }, requestId },
      result.failure.status,
    );
  return c.json(HealthResponseSchema.parse(result.value));
});
