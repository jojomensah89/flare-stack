export interface ServerBindings {
  FLARE_ENVIRONMENT?: string;
}

export interface ServerVariables {
  requestId: string;
}

export interface ServerEnv {
  Bindings: ServerBindings;
  Variables: ServerVariables;
}
