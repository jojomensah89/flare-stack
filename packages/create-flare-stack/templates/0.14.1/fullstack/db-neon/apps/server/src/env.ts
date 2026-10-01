export interface ServerBindings {
  FLARE_ENVIRONMENT?: string;
  DATABASE_URL: string;
}

export interface ServerVariables {
  requestId: string;
}

export interface ServerEnv {
  Bindings: ServerBindings;
  Variables: ServerVariables;
}
