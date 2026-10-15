import { z } from "zod";

export const HealthResponseSchema = z.object({ ok: z.literal(true) });
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  createdAt: z.string().datetime(),
});
export type ItemDto = z.infer<typeof ItemSchema>;

export const ItemsResponseSchema = z.object({ items: z.array(ItemSchema) });
export type ItemsResponse = z.infer<typeof ItemsResponseSchema>;

export const CreateItemRequestSchema = z.object({ name: z.string().trim().min(1).max(120) });
export type CreateItemRequest = z.infer<typeof CreateItemRequestSchema>;

export const CreateItemResponseSchema = z.object({ item: ItemSchema });
export type CreateItemResponse = z.infer<typeof CreateItemResponseSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({ code: z.string().min(1), message: z.string().min(1) }),
  requestId: z.string().min(1),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const apiContract = {
  health: { method: "GET", path: "/api/health", response: HealthResponseSchema },
  items: { method: "GET", path: "/api/items", response: ItemsResponseSchema },
  createItem: {
    method: "POST",
    path: "/api/items",
    request: CreateItemRequestSchema,
    response: CreateItemResponseSchema,
  },
} as const;
