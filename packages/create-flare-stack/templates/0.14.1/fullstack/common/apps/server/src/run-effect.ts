import { logStructuredError } from "@repo/observability";
import { Effect, Either } from "effect";
import type { Layer } from "effect";
import { ItemStoreError } from "./service-tags";

export type ApiFailure = {
  status: 400 | 401 | 403 | 404 | 409 | 500;
  code: string;
  message: string;
};

export type ApiResult<A> = { ok: true; value: A } | { ok: false; failure: ApiFailure };

function failureFrom(error: unknown): ApiFailure {
  if (error instanceof ItemStoreError) {
    return {
      status: 500,
      code: "ITEM_STORE_FAILED",
      message: "The item request could not be completed.",
    };
  }
  return { status: 500, code: "INTERNAL_ERROR", message: "The request could not be completed." };
}

export async function runEffect<A, E, R, LE>(
  program: Effect.Effect<A, E, R>,
  layer: Layer.Layer<R, LE, never>,
  requestId: string,
): Promise<ApiResult<A>> {
  try {
    const result = await Effect.runPromise(
      Effect.scoped(Effect.either(Effect.provide(program, layer))),
    );
    if (Either.isLeft(result)) {
      const failure = failureFrom(result.left);
      logStructuredError(new Error("An Effect request failed."), {
        operation: "effect.request",
        requestId,
        errorCode: failure.code,
      });
      return { ok: false, failure };
    }
    return { ok: true, value: result.right };
  } catch (error) {
    logStructuredError(new Error("An Effect request defect occurred."), {
      operation: "effect.request",
      requestId,
      defectType: error instanceof Error ? error.name : typeof error,
    });
    return {
      ok: false,
      failure: {
        status: 500,
        code: "INTERNAL_ERROR",
        message: "The request could not be completed.",
      },
    };
  }
}
