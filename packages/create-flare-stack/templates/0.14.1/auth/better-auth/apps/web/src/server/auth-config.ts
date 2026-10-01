export type AuthEnvironmentConfig = {
  FLARE_ENVIRONMENT?: string;
  AUTH_ALLOWED_HOSTS?: string;
  AUTH_PROTOCOL?: string;
  BETTER_AUTH_SECRET?: string;
};

export type ResolvedAuthConfig = {
  allowedHosts: string[];
  protocol: "http" | "https";
  secret: string;
};

const HOST_PLACEHOLDER = "__SET_AUTH_ALLOWED_HOSTS__";

export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigurationError";
  }
}

export class AuthOriginError extends Error {
  constructor() {
    super("Authentication request origin is not allowed");
    this.name = "AuthOriginError";
  }
}

function normalizeExactHost(value: string): string {
  const host = value.trim();
  if (!host || host.includes(",") || /[\s/@?#*]/.test(host)) {
    throw new AuthConfigurationError(
      "AUTH_ALLOWED_HOSTS must contain exact hostnames without wildcards or URLs",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(`http://${host}`);
  } catch {
    throw new AuthConfigurationError("AUTH_ALLOWED_HOSTS contains an invalid hostname");
  }

  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.host !== host.toLowerCase()
  ) {
    throw new AuthConfigurationError(
      "AUTH_ALLOWED_HOSTS must contain exact hostnames without wildcards or URLs",
    );
  }

  return parsed.host;
}

function normalizeAllowedHost(value: string, environment?: string): string {
  const host = value.trim();
  if (!host.includes("*")) {
    return normalizeExactHost(host);
  }

  // Worker Preview URLs vary in their deployment prefix. Permit only the
  // worker-scoped pattern, never a domain-wide wildcard such as `*.workers.dev`.
  if (
    !host.startsWith("*-") ||
    host.indexOf("*") !== 0 ||
    host.includes(":") ||
    host.includes("/")
  ) {
    throw new AuthConfigurationError(
      "AUTH_ALLOWED_HOSTS only supports worker-scoped preview patterns such as `*-worker.account.workers.dev`",
    );
  }

  const suffix = normalizeExactHost(host.slice(2));
  const labels = suffix.split(".");
  if (
    environment !== "preview" ||
    suffix.includes(":") ||
    labels.length !== 4 ||
    !suffix.endsWith(".workers.dev") ||
    (labels[0] ?? "").length > 61 ||
    (labels[0] ?? "").startsWith("-") ||
    (labels[0] ?? "").endsWith("-")
  ) {
    throw new AuthConfigurationError(
      "AUTH_ALLOWED_HOSTS contains an invalid worker-scoped preview pattern",
    );
  }

  return `*-${suffix}`;
}

function hostMatches(host: string, allowedHost: string): boolean {
  if (!allowedHost.startsWith("*-")) {
    return host === allowedHost;
  }

  const suffix = allowedHost.slice(1);
  if (!host.endsWith(suffix)) {
    return false;
  }

  const prefix = host.slice(0, host.length - suffix.length);
  const suffixLabel = suffix.slice(1).split(".")[0] ?? "";
  return (
    prefix.length > 0 &&
    prefix.length + 1 + suffixLabel.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(prefix)
  );
}

export function resolveAuthConfig(config: AuthEnvironmentConfig): ResolvedAuthConfig {
  const hostsValue = config.AUTH_ALLOWED_HOSTS?.trim();
  if (!hostsValue || hostsValue === HOST_PLACEHOLDER || hostsValue.includes("<")) {
    throw new AuthConfigurationError(
      "AUTH_ALLOWED_HOSTS is required. Run `flare setup cloudflare` with the exact public hostnames for production and Preview.",
    );
  }

  const allowedHosts = [
    ...new Set(
      hostsValue.split(",").map((host) => normalizeAllowedHost(host, config.FLARE_ENVIRONMENT)),
    ),
  ];
  if (allowedHosts.length === 0) {
    throw new AuthConfigurationError("AUTH_ALLOWED_HOSTS must include at least one exact hostname");
  }

  let protocol: "http" | "https";
  if (config.AUTH_PROTOCOL === "http") {
    protocol = "http";
  } else if (config.AUTH_PROTOCOL === "https") {
    protocol = "https";
  } else {
    throw new AuthConfigurationError("AUTH_PROTOCOL must be explicitly set to `http` or `https`");
  }

  const secret = config.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new AuthConfigurationError(
      "BETTER_AUTH_SECRET must be set to a high-entropy value of at least 32 characters",
    );
  }

  return { allowedHosts, protocol, secret };
}

export function validateAuthRequestOrigin(request: Request, config: AuthEnvironmentConfig): void {
  const authConfig = resolveAuthConfig(config);
  const requestUrl = new URL(request.url);
  const requestHost = normalizeExactHost(requestUrl.host);
  const hostHeader = request.headers.get("host");
  if (!hostHeader) {
    throw new AuthOriginError();
  }

  let headerHost: string;
  try {
    headerHost = normalizeExactHost(hostHeader);
  } catch {
    throw new AuthOriginError();
  }

  if (
    requestUrl.protocol !== `${authConfig.protocol}:` ||
    requestHost !== headerHost ||
    !authConfig.allowedHosts.some((allowedHost) => hostMatches(requestHost, allowedHost))
  ) {
    throw new AuthOriginError();
  }
}
