import { Hono } from "hono";
import type { ServerEnv } from "../env";

export const itemRoutes = new Hono<ServerEnv>().get("/", (c) => {
  return c.json({
    items: [
      { id: "item-1", name: "Flare Fullstack Item 1" },
      { id: "item-2", name: "Flare Fullstack Item 2" },
    ],
  });
});
