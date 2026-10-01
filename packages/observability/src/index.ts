import { log } from "evlog";
import type { RequestLogFields } from "./fields";
import { redactSensitiveData } from "./redact";

export * from "./fields";
export * from "./redact";

export function logRequestEvent(fields: RequestLogFields): void {
  const safeData = redactSensitiveData(fields);
  log.info({ event: "http.request", ...safeData });
}

export function logStructuredError(error: unknown, context?: Record<string, unknown>): void {
  const safeContext = redactSensitiveData(context ?? {});
  const errorType = error instanceof Error ? error.name || "Error" : "NonErrorThrown";

  // Error messages and stacks often contain request data or credentials. Keep
  // the stable error class for triage and leave the raw value out of logs.
  log.error({ ...safeContext, event: "app.error", error: { type: errorType } });
}
