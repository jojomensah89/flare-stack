import {
  CreateItemRequestSchema,
  CreateItemResponseSchema,
  ItemsResponseSchema,
} from "@repo/shared/api";
import { Hono } from "hono";
import { createItem, listItems, makeItemStoreLayer } from "../services";
import { runEffect } from "../run-effect";
import type { ServerEnv } from "../env";

export const itemRoutes = new Hono<ServerEnv>()
  .get("/", async (c) => {
    const requestId = c.get("requestId");
    const result = await runEffect(listItems(), makeItemStoreLayer(c.env), requestId);
    if (!result.ok) {
      return c.json(
        { error: { code: result.failure.code, message: result.failure.message }, requestId },
        result.failure.status,
      );
    }
    return c.json(ItemsResponseSchema.parse({ items: result.value }));
  })
  .post("/", async (c) => {
    const requestId = c.get("requestId");
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        { error: { code: "INVALID_JSON", message: "Request body must be valid JSON." }, requestId },
        400,
      );
    }
    const input = CreateItemRequestSchema.safeParse(body);
    if (!input.success) {
      return c.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Provide an item name between 1 and 120 characters.",
          },
          requestId,
        },
        400,
      );
    }
    const result = await runEffect(
      createItem(input.data.name),
      makeItemStoreLayer(c.env),
      requestId,
    );
    if (!result.ok) {
      return c.json(
        { error: { code: result.failure.code, message: result.failure.message }, requestId },
        result.failure.status,
      );
    }
    return c.json(CreateItemResponseSchema.parse({ item: result.value }), 201);
  });
