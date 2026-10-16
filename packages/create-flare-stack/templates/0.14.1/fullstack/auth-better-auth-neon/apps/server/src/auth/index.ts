import { Pool } from "@neondatabase/serverless";
import { Effect, Layer } from "effect";
import { account, createDb, rateLimit, session, user, verification } from "@repo/db/neon";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { ServerBindings } from "../env";
import { AuthHandler } from "../service-tags";
import { resolveServerAuthConfig, validateServerAuthRequestOrigin } from "./config";

export { validateServerAuthRequestOrigin };

export function createServerAuth(bindings: ServerBindings, pool: Pool) {
  if (!bindings.DATABASE_URL) {
    throw new Error("Neon DATABASE_URL is required for fullstack Better Auth");
  }
  const authConfig = resolveServerAuthConfig(bindings);
  const db = createDb(pool);

  return betterAuth({
    secret: authConfig.secret,
    baseURL: {
      allowedHosts: authConfig.allowedHosts,
      protocol: authConfig.protocol,
    },
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user,
        session,
        account,
        verification,
        rateLimit,
      },
    }),
    emailAndPassword: {
      enabled: true,
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/get-session": false,
      },
    },
    advanced: {
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip"],
      },
    },
  });
}

export type ServerAuthInstance = ReturnType<typeof createServerAuth>;

class AuthServiceError extends Error {
  constructor(cause: unknown) {
    super("The authentication request failed.", { cause });
    this.name = "AuthServiceError";
  }
}

export function makeAuthLayer(
  bindings: ServerBindings,
): Layer.Layer<AuthHandler, AuthServiceError> {
  const acquirePool = Effect.acquireRelease(
    Effect.sync(() => new Pool({ connectionString: bindings.DATABASE_URL })),
    (pool) => Effect.promise(() => pool.end()),
  );
  const auth = Effect.flatMap(acquirePool, (pool) =>
    Effect.try({
      try: () => createServerAuth(bindings, pool),
      catch: (cause) => new AuthServiceError(cause),
    }),
  );
  return Layer.scoped(
    AuthHandler,
    Effect.map(auth, (instance) => ({
      handle: (request: Request) =>
        Effect.tryPromise({
          try: () => instance.handler(request),
          catch: (cause) => new AuthServiceError(cause),
        }),
    })),
  );
}
