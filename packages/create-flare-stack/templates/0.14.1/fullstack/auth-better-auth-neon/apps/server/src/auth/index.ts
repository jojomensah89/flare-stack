import { account, createDb, rateLimit, session, user, verification } from "@repo/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { ServerBindings } from "../env";
import { resolveServerAuthConfig, validateServerAuthRequestOrigin } from "./config";

export { validateServerAuthRequestOrigin };

export function createServerAuth(bindings: ServerBindings) {
  if (!bindings.DATABASE_URL) {
    throw new Error("Neon DATABASE_URL is required for fullstack Better Auth");
  }
  const authConfig = resolveServerAuthConfig(bindings);
  const db = createDb(bindings.DATABASE_URL);

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

export function getAuth(bindings: ServerBindings): ServerAuthInstance {
  return createServerAuth(bindings);
}
