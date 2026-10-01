import {
  account,
  type ExecutionContext,
  type NeonDatabase,
  rateLimit,
  session,
  user,
  verification,
  withDb,
} from "@repo/db/neon";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { resolveAuthConfig } from "./auth-config";

export type NeonAuthEnv = {
  DATABASE_URL: string;
  FLARE_ENVIRONMENT?: string;
  AUTH_ALLOWED_HOSTS?: string;
  AUTH_PROTOCOL?: string;
  BETTER_AUTH_SECRET?: string;
};

export function createNeonAuth(env: NeonAuthEnv, db: NeonDatabase) {
  const authConfig = resolveAuthConfig(env);

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
    plugins: [tanstackStartCookies()],
  });
}

export type NeonAuthInstance = ReturnType<typeof createNeonAuth>;

export async function withNeonAuth<T>(
  env: NeonAuthEnv,
  ctx: ExecutionContext,
  run: (auth: NeonAuthInstance, db: NeonDatabase) => Promise<T>,
): Promise<T> {
  return withDb(env, ctx, async (db) => {
    const authInstance = createNeonAuth(env, db);
    return await run(authInstance, db);
  });
}
