import type { RedactConfig } from "evlog";

const SENSITIVE_KEYS = new Set([
  "authorization",
  "cookie",
  "set_cookie",
  "password",
  "secret",
  "token",
  "api_key",
  "apikey",
  "database_url",
  "connection_string",
  "email",
  "phone",
  "ip",
  "ip_address",
  "cf_connecting_ip",
  "x_forwarded_for",
  "user_id",
]);

export const EVLOG_REDACTION: RedactConfig = {
  paths: [
    "**.authorization",
    "**.cookie",
    "**.set-cookie",
    "**.password",
    "**.secret",
    "**.token",
    "**.*_token",
    "**.api_key",
    "**.apikey",
    "**.database_url",
    "**.connection_string",
    "**.email",
    "**.phone",
    "**.ip",
    "**.ip_address",
    "**.cf-connecting-ip",
    "**.x-forwarded-for",
    "**.user_id",
  ],
  patterns: [
    // Request URLs are useful context, but query values can contain credentials.
    /([?&][^=&#]+)=([^&#]*)/g,
    // Long opaque path segments are commonly one-time tokens.
    /\/[A-Za-z0-9_-]{40,}(?=\/|$|[?#])/g,
  ],
  builtins: ["email", "ipv4", "jwt", "bearer"],
};

const REDACTED = "[REDACTED]";

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[\s.-]/g, "_");
  return (
    SENSITIVE_KEYS.has(normalized) ||
    /(^|_)(?:access|refresh|id)?_?token(?:_|$)/.test(normalized) ||
    /(?:authorization|cookie|credential|password|secret|api_key|database_url|connection_string)/.test(
      normalized,
    ) ||
    /(^|_)email(?:_|$)/.test(normalized) ||
    /(^|_)(?:phone|ip_address|cf_connecting_ip|x_forwarded_for)(_|$)/.test(normalized)
  );
}

function redactString(value: string): string {
  return value
    .replace(/([?&][^=&#]+)=([^&#]*)/g, `$1${REDACTED}`)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, `Bearer ${REDACTED}`)
    .replace(/\b(?:[A-Za-z0-9_-]{10,}\.){2}[A-Za-z0-9_-]{10,}\b/g, REDACTED)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, REDACTED)
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, REDACTED)
    .replace(/\/[A-Za-z0-9_-]{40,}(?=\/|$|[?#])/g, `/${REDACTED}`);
}

export function redactSensitiveData<T>(value: T): T {
  const seen = new WeakMap<object, unknown>();

  const redact = (current: unknown, key?: string): unknown => {
    if (key && isSensitiveKey(key)) {
      return REDACTED;
    }
    if (typeof current === "string") {
      return redactString(current);
    }
    if (current === null || typeof current !== "object") {
      return current;
    }
    if (current instanceof Error) {
      return { name: current.name || "Error" };
    }
    if (current instanceof Date) {
      return current.toISOString();
    }
    if (seen.has(current)) {
      return "[Circular]";
    }

    if (Array.isArray(current)) {
      const result: unknown[] = [];
      seen.set(current, result);
      for (const item of current) {
        result.push(redact(item));
      }
      return result;
    }

    const result: Record<string, unknown> = {};
    seen.set(current, result);
    for (const [childKey, childValue] of Object.entries(current)) {
      result[childKey] = redact(childValue, childKey);
    }
    return result;
  };

  return redact(value) as T;
}
