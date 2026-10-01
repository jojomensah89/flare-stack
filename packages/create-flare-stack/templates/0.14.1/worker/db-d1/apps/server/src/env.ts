export interface ServerBindings {
  DB: D1Database;
  FLARE_ENVIRONMENT?: "development" | "preview" | "production";
}

export interface ServerEnv {
  Bindings: ServerBindings;
  Variables: {
    requestId: string;
  };
}
