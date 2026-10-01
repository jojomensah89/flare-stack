export interface FlareConfig {
  schemaVersion: number;
  flareVersion: string;
  productionBranch: string;
  preset: "app" | "fullstack" | "extension" | "worker";
  database: "none" | "d1" | "neon";
  auth: "none" | "better-auth";
  observability: "evlog" | "none";
  uiLint: "shadcn" | "none";
  capabilities: string[];
  deployment: {
    provider: "cloudflare";
    productionBranch: string;
  };
}

export function validateFlareConfig(value: unknown): FlareConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("flare.config.ts must export a configuration object as its default export.");
  }

  const config = value as Partial<FlareConfig>;
  const presets = ["app", "fullstack", "extension", "worker"];
  const databases = ["none", "d1", "neon"];
  const authModes = ["none", "better-auth"];
  const observabilityModes = ["evlog", "none"];
  const uiLintModes = ["shadcn", "none"];

  if (config.schemaVersion !== 1) {
    throw new Error(`Unsupported flare.config.ts schemaVersion: ${String(config.schemaVersion)}.`);
  }
  if (!config.flareVersion || typeof config.flareVersion !== "string") {
    throw new Error("flare.config.ts must include a string flareVersion.");
  }
  if (!config.productionBranch || typeof config.productionBranch !== "string") {
    throw new Error("flare.config.ts must include the productionBranch used by Cloudflare Builds.");
  }
  if (!config.preset || !presets.includes(config.preset)) {
    throw new Error(`Unsupported project preset: ${String(config.preset)}.`);
  }
  if (!config.database || !databases.includes(config.database)) {
    throw new Error(`Unsupported database profile: ${String(config.database)}.`);
  }
  if (!config.auth || !authModes.includes(config.auth)) {
    throw new Error(`Unsupported authentication mode: ${String(config.auth)}.`);
  }
  if (config.auth === "better-auth" && config.database === "none") {
    throw new Error("Better Auth requires a database profile; choose D1 or Neon.");
  }
  if (!config.observability || !observabilityModes.includes(config.observability)) {
    throw new Error(`Unsupported observability mode: ${String(config.observability)}.`);
  }
  if (!config.uiLint || !uiLintModes.includes(config.uiLint)) {
    throw new Error(`Unsupported UI lint mode: ${String(config.uiLint)}.`);
  }
  if (config.deployment?.provider !== "cloudflare") {
    throw new Error("flare.config.ts must select Cloudflare as its deployment provider.");
  }
  if (
    !config.deployment.productionBranch ||
    config.deployment.productionBranch !== config.productionBranch
  ) {
    throw new Error("productionBranch and deployment.productionBranch must match.");
  }
  if (
    !Array.isArray(config.capabilities) ||
    !config.capabilities.every((item) => typeof item === "string")
  ) {
    throw new Error("flare.config.ts capabilities must be an array of strings.");
  }

  return config as FlareConfig;
}

export function defineFlareConfig(config: FlareConfig): FlareConfig {
  return validateFlareConfig(config);
}
