import { account, createDb, rateLimit, session, user, verification } from "@repo/db/neon";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import {
  resolveAuthConfig,
  validateAuthRequestOrigin as validateOrigin,
  type AuthEnvironmentConfig,
} from "./auth-config";

let workersEnv: Record<string, unknown> = {};
try {
  const cf = await import("cloudflare:workers");
  workersEnv = (cf.env as unknown as Record<string, unknown>) || {};
} catch {
  workersEnv = (process.env as unknown as Record<string, unknown>) || {};
}

export type AuthEnv = AuthEnvironmentConfig & {
  DATABASE_URL: string;
};

function currentEnvironment(bindings?: AuthEnv): AuthEnv {
  return (bindings ?? workersEnv) as AuthEnv;
}

export function validateAuthRequestOrigin(request: Request, bindings?: AuthEnv): void {
  validateOrigin(request, currentEnvironment(bindings));
}

export function createAuth(bindings?: AuthEnv) {
  const currentEnv = currentEnvironment(bindings);
  const connectionString = currentEnv.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Neon DATABASE_URL is required for Better Auth");
  }

  const authConfig = resolveAuthConfig(currentEnv);
  const db = createDb(connectionString);

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

export type AuthInstance = ReturnType<typeof createAuth>;

let cachedAuth: AuthInstance | null = null;

export function getAuth(bindings?: AuthEnv): AuthInstance {
  if (bindings) {
    return createAuth(bindings);
  }
  if (!cachedAuth) {
    cachedAuth = createAuth();
  }
  return cachedAuth;
}

export const auth = new Proxy({} as AuthInstance, {
  get(_target, prop) {
    const instance = getAuth();
    const val = (instance as Record<string | symbol, unknown>)[prop];
    return typeof val === "function" ? val.bind(instance) : val;
  },
});
