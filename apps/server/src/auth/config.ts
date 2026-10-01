export type ServerAuthConfigInput = {
  FLARE_ENVIRONMENT?: string;
  AUTH_ALLOWED_HOSTS?: string;
  AUTH_PROTOCOL?: string;
  BETTER_AUTH_SECRET?: string;
};

export class ServerAuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerAuthConfigurationError";
  }
}

export class ServerAuthOriginError extends Error {
  constructor() {
    super("Authentication request origin is not allowed");
    this.name = "ServerAuthOriginError";
  }
}

function exactHost(value: string): string {
  const host = value.trim();
  if (!host || /[\s/@?#*]/.test(host) || host.includes(",")) {
    throw new ServerAuthConfigurationError("AUTH_ALLOWED_HOSTS contains an invalid hostname");
  }
  try {
    const parsed = new URL(`http://${host}`);
    if (
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      parsed.host !== host.toLowerCase()
    ) {
      throw new Error("invalid host");
    }
    return parsed.host;
  } catch {
    throw new ServerAuthConfigurationError("AUTH_ALLOWED_HOSTS contains an invalid hostname");
  }
}

function allowedHost(value: string, environment?: string): string {
  const host = value.trim();
  if (!host.includes("*")) {
    return exactHost(host);
  }
  if (!host.startsWith("*-") || host.indexOf("*") !== 0 || host.includes(":")) {
    throw new ServerAuthConfigurationError(
      "Only worker-scoped Preview hostname patterns are supported",
    );
  }
  const suffix = exactHost(host.slice(2));
  const firstLabel = suffix.split(".")[0] ?? "";
  if (
    environment !== "preview" ||
    suffix.includes(":") ||
    suffix.split(".").length < 3 ||
    firstLabel.length > 61 ||
    firstLabel.startsWith("-") ||
    firstLabel.endsWith("-")
  ) {
    throw new ServerAuthConfigurationError(
      "AUTH_ALLOWED_HOSTS contains an invalid Preview hostname pattern",
    );
  }
  return `*-${suffix}`;
}

function hostMatches(host: string, pattern: string): boolean {
  if (!pattern.startsWith("*-")) {
    return host === pattern;
  }
  const suffix = pattern.slice(1);
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

export function resolveServerAuthConfig(input: ServerAuthConfigInput) {
  const rawHosts = input.AUTH_ALLOWED_HOSTS?.trim();
  if (!rawHosts || rawHosts === "__SET_AUTH_ALLOWED_HOSTS__" || rawHosts.includes("<")) {
    throw new ServerAuthConfigurationError(
      "AUTH_ALLOWED_HOSTS is required. Configure the exact public hostname for this environment.",
    );
  }
  const allowedHosts = [
    ...new Set(rawHosts.split(",").map((host) => allowedHost(host, input.FLARE_ENVIRONMENT))),
  ];
  let protocol: "http" | "https";
  if (input.AUTH_PROTOCOL === "http") {
    protocol = "http";
  } else if (input.AUTH_PROTOCOL === "https") {
    protocol = "https";
  } else {
    throw new ServerAuthConfigurationError(
      "AUTH_PROTOCOL must be explicitly set to `http` or `https`",
    );
  }
  const secret = input.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new ServerAuthConfigurationError(
      "BETTER_AUTH_SECRET must be set to a value of at least 32 characters",
    );
  }
  return { allowedHosts, protocol, secret };
}

export function validateServerAuthRequestOrigin(
  request: Request,
  input: ServerAuthConfigInput,
): void {
  const config = resolveServerAuthConfig(input);
  const url = new URL(request.url);
  let requestHost: string;
  let headerHost: string;
  try {
    requestHost = exactHost(url.host);
    const host = request.headers.get("host");
    if (!host) {
      throw new Error("missing host");
    }
    headerHost = exactHost(host);
  } catch {
    throw new ServerAuthOriginError();
  }

  if (
    url.protocol !== `${config.protocol}:` ||
    requestHost !== headerHost ||
    !config.allowedHosts.some((pattern) => hostMatches(requestHost, pattern))
  ) {
    throw new ServerAuthOriginError();
  }
}
