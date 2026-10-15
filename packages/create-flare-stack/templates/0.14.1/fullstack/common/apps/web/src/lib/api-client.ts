import {
  ApiErrorSchema,
  CreateItemResponseSchema,
  HealthResponseSchema,
  ItemsResponseSchema,
  type CreateItemRequest,
  type CreateItemResponse,
  type HealthResponse,
  type ItemsResponse,
} from "@repo/shared/api";
import type { ZodType } from "zod";

export class ApiHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiHttpError";
  }
}

async function request<T>(path: string, schema: ZodType<T>, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers,
  });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = ApiErrorSchema.safeParse(payload);
    throw new ApiHttpError(
      error.success ? error.data.error.message : `Request failed with status ${response.status}.`,
      response.status,
      error.success ? error.data.error.code : "HTTP_ERROR",
      error.success ? error.data.requestId : (response.headers.get("x-request-id") ?? undefined),
    );
  }
  const decoded = schema.safeParse(payload);
  if (!decoded.success) {
    throw new ApiHttpError(
      "The server returned an invalid response.",
      response.status,
      "INVALID_RESPONSE",
    );
  }
  return decoded.data;
}

export const apiClient = {
  health: (signal?: AbortSignal): Promise<HealthResponse> =>
    request("/api/health", HealthResponseSchema, { signal }),
  items: (signal?: AbortSignal): Promise<ItemsResponse> =>
    request("/api/items", ItemsResponseSchema, { signal }),
  createItem: (input: CreateItemRequest): Promise<CreateItemResponse> =>
    request("/api/items", CreateItemResponseSchema, {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
