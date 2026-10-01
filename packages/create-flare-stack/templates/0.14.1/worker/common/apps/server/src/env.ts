export interface ServerBindings {
  FLARE_ENVIRONMENT?: "development" | "preview" | "production";
}

export interface ServerEnv {
  Bindings: ServerBindings;
  Variables: {
    requestId: string;
  };
}
