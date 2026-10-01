import { Hono } from "hono";
import type { ServerEnv } from "../env";

export const healthRoutes = new Hono<ServerEnv>().get("/", (c) => {
  return c.json({ ok: true });
});
