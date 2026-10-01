import { createFileRoute } from "@tanstack/react-router";
import { logStructuredError } from "@repo/observability";
import { AuthOriginError } from "../../../server/auth-config";
import { auth, validateAuthRequestOrigin } from "../../../server/auth";

async function handleAuthRequest(request: Request) {
  try {
    validateAuthRequestOrigin(request);
  } catch (error: unknown) {
    if (error instanceof AuthOriginError) {
      return Response.json({ error: "Invalid request origin" }, { status: 403 });
    }
    logStructuredError(error, { operation: "auth.origin_validation" });
    return Response.json({ error: "Authentication is not configured" }, { status: 500 });
  }

  try {
    return await auth.handler(request);
  } catch (error: unknown) {
    logStructuredError(error, { operation: "auth.handler" });
    return Response.json({ error: "Authentication request failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }) => handleAuthRequest(request),
      POST: async ({ request }) => handleAuthRequest(request),
    },
  },
});
