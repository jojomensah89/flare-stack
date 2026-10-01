export interface ServerBindings {
  DATABASE_URL: string;
  FLARE_ENVIRONMENT?: "development" | "preview" | "production";
}

export interface ServerEnv {
  Bindings: ServerBindings;
  Variables: {
    requestId: string;
  };
}
