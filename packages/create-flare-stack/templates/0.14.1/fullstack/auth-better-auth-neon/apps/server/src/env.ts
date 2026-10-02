export interface ServerBindings {
  FLARE_ENVIRONMENT?: string;
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  AUTH_ALLOWED_HOSTS?: string;
  AUTH_PROTOCOL?: string;
}

export interface ServerVariables {
  requestId: string;
}

export interface ServerEnv {
  Bindings: ServerBindings;
  Variables: ServerVariables;
}
