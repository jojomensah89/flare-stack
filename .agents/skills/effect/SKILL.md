---
name: effect
description: TypeScript Effect conventions, typed error handling, and Hono integration in Flare Stack servers.
---

# Effect Skill

Procedures and conventions for writing functional, type-safe backend logic using the TypeScript `effect` package in Flare Stack.

## Core Concepts

1. **`Effect<Success, Error, Requirements>`**:
   - Represents a lazy, pure computation that may produce a value `Success`, fail with typed error `Error`, and require context `Requirements`.
   - Never throw raw exceptions in business logic; represent domain failures as typed error classes extending `HttpError` or `Data.TaggedError`.

2. **Hono Route Integration**:
   - Bridge Effects to Hono responses using `runEffect(c, effect, [status])` from `src/effect.ts`.
   - Succeeded effects return JSON with the specified status code (default `200`).
   - Expected `HttpError` failures (e.g. `NotFoundError`, `ValidationError`) map automatically to JSON error responses with their corresponding HTTP status codes.
   - Unexpected defects or panics are caught, logged structured to `evlog` with request ID correlation, and return a clean `500 Internal Server Error`.

3. **Writing Generators (`Effect.gen`)**:
   - Use `Effect.gen(function* () { ... })` for sequential async flows.
   - Use `yield* Effect.fail(new NotFoundError(...))` for early return on missing resources or domain violations.
   - Use `yield* Effect.tryPromise(...)` or `Effect.try(...)` to wrap third-party promise-based or throwing libraries.

4. **Service & Layer Pattern**:
   - Define domain operations as Effect Services using `Context.GenericTag`.
   - Provide implementations using `Layer` for testability, mockability, and clean dependency management.

## Example

```typescript
import { Effect } from "effect";
import { Hono } from "hono";
import { NotFoundError, runEffect } from "../effect";
import type { ServerEnv } from "../env";

export const itemRoutes = new Hono<ServerEnv>().get("/:id", (c) => {
  const id = c.req.param("id");
  return runEffect(
    c,
    Effect.gen(function* () {
      const item = yield* findItemById(id);
      if (!item) {
        return yield* Effect.fail(new NotFoundError(`Item ${id} not found`));
      }
      return { item };
    }),
  );
});
```
