import type { D1Database } from "@cloudflare/workers-types";

export interface ServerBindings {
  FLARE_ENVIRONMENT?: string;
  DB: D1Database;
}

export interface ServerVariables {
  requestId: string;
}

export interface ServerEnv {
  Bindings: ServerBindings;
  Variables: ServerVariables;
}
