import { createDb, account, rateLimit, session, user, verification } from "@repo/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { Effect, Layer } from "effect";
import type { ServerBindings } from "../env";
import { AuthHandler } from "../service-tags";
import { resolveServerAuthConfig, validateServerAuthRequestOrigin } from "./config";

export { validateServerAuthRequestOrigin };

export function createServerAuth(bindings: ServerBindings) {
  if (!bindings.DB) {
    throw new Error("D1 database binding 'DB' is required for fullstack Better Auth");
  }
  const authConfig = resolveServerAuthConfig(bindings);
  const db = createDb(bindings.DB);

  return betterAuth({
    secret: authConfig.secret,
    baseURL: {
      allowedHosts: authConfig.allowedHosts,
      protocol: authConfig.protocol,
    },
    database: drizzleAdapter(db, {
      provider: "sqlite",
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
  const auth = Effect.try({
    try: () => createServerAuth(bindings),
    catch: (cause) => new AuthServiceError(cause),
  });
  return Layer.effect(
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
