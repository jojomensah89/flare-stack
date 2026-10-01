import { auth } from "./auth";
import { logStructuredError } from "@repo/observability";

export async function getServerSession(headers: Headers) {
  try {
    return await auth.api.getSession({
      headers,
    });
  } catch (error) {
    logStructuredError(error, { operation: "session.lookup" });
    return null;
  }
}

export async function requireServerSession(headers: Headers) {
  const sessionData = await getServerSession(headers);
  if (!sessionData?.session || !sessionData?.user) {
    throw new Error("Unauthorized: Active session required");
  }
  return sessionData;
}

export async function getCurrentUser(headers: Headers) {
  const sessionData = await getServerSession(headers);
  return sessionData?.user ?? null;
}
