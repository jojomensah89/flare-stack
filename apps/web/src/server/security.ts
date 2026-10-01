export const FLARE_ENVIRONMENTS = ["development", "preview", "production"] as const;

export type FlareEnvironment = (typeof FLARE_ENVIRONMENTS)[number];

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy-Report-Only":
    "default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
};

export function requireFlareEnvironment(value: unknown): FlareEnvironment {
  if (FLARE_ENVIRONMENTS.includes(value as FlareEnvironment)) {
    return value as FlareEnvironment;
  }
  throw new Error("FLARE_ENVIRONMENT must be set to development, preview, or production");
}

export function applySecurityHeaders(
  response: Response,
  environment: FlareEnvironment,
  requestId?: string,
): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }

  if (environment === "preview") {
    headers.set("X-Robots-Tag", "noindex, nofollow");
  } else {
    headers.delete("X-Robots-Tag");
  }
  if (requestId) {
    headers.set("x-request-id", requestId);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function cloudflareStaticHeaders(environment: FlareEnvironment): string {
  const lines = [
    "/*",
    ...Object.entries(SECURITY_HEADERS).map(([name, value]) => `  ${name}: ${value}`),
  ];
  if (environment === "preview") {
    lines.push("  X-Robots-Tag: noindex, nofollow");
  }
  return `${lines.join("\n")}\n`;
}
