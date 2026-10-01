import type { D1Database } from "@cloudflare/workers-types";

export type ServerBindings = {
  DB: D1Database;
  FLARE_ENVIRONMENT?: string;
  AUTH_ALLOWED_HOSTS?: string;
  AUTH_PROTOCOL?: string;
  BETTER_AUTH_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
};

export type ServerVariables = {
  requestId: string;
};

export type ServerEnv = {
  Bindings: ServerBindings;
  Variables: ServerVariables;
};
