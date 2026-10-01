import {
  type CliDependencies,
  expectOnlyFlags,
  getOutput,
  type HealthFetcher,
  parseJsonOutput,
} from "./common";

export function normalizeBaseUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`Invalid health-check URL: ${input}. Pass an absolute http(s) URL.`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`Health-check URL must use http or https: ${input}.`);
  }
  return url;
}

export async function verifyAppHealth(base: string, fetcher: HealthFetcher): Promise<void> {
  const origin = normalizeBaseUrl(base);
  const root = await fetcher(new URL("/", origin), { method: "GET", redirect: "manual" });
  if (!root.ok) {
    throw new Error(`Root document health check failed: HTTP ${root.status} at ${origin.origin}/.`);
  }
  const health = await fetcher(new URL("/health", origin), { method: "GET", redirect: "manual" });
  if (!health.ok) {
    throw new Error(`/health check failed: HTTP ${health.status} at ${origin.origin}/health.`);
  }
  let body: unknown;
  try {
    body = await health.json();
  } catch {
    throw new Error(`/health returned a non-JSON response at ${origin.origin}/health.`);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(`/health returned an invalid response at ${origin.origin}/health.`);
  }
  const record = body as Record<string, unknown>;
  if (record.ok !== true || Object.keys(record).length !== 1) {
    throw new Error(`/health must return only { ok: true } at ${origin.origin}/health.`);
  }
}

export function deployedUrls(output: string): string[] {
  return [...new Set(output.match(/https:\/\/[A-Za-z0-9._-]+\.workers\.dev(?:\/[^\s]*)?/g) ?? [])];
}

export function previewUrls(source: string): {
  urls: string[];
  name?: string;
  deploymentId?: string;
} {
  const parsed = parseJsonOutput(source, "wrangler preview --json") as Record<string, unknown>;
  const preview =
    parsed.preview && typeof parsed.preview === "object" && !Array.isArray(parsed.preview)
      ? (parsed.preview as Record<string, unknown>)
      : {};
  const deployment =
    parsed.deployment && typeof parsed.deployment === "object" && !Array.isArray(parsed.deployment)
      ? (parsed.deployment as Record<string, unknown>)
      : {};
  const urls = [
    ...(Array.isArray(preview.urls) ? preview.urls : []),
    ...(Array.isArray(deployment.urls) ? deployment.urls : []),
  ].filter((value): value is string => typeof value === "string" && value.startsWith("https://"));
  return {
    urls: [...new Set(urls)],
    ...(typeof preview.name === "string" ? { name: preview.name } : {}),
    ...(typeof deployment.id === "string" ? { deploymentId: deployment.id } : {}),
  };
}

export async function commandHealth(args: string[], deps: CliDependencies): Promise<number> {
  expectOnlyFlags(args, [], 1);
  const target = args.find((arg) => !arg.startsWith("--")) ?? "http://localhost:5173";
  try {
    const origin = normalizeBaseUrl(target);
    await verifyAppHealth(origin.toString(), deps.fetcher ?? fetch);
    getOutput(deps).log(`Health checks passed for ${origin.origin}: root and /health.`);
    return 0;
  } catch (error) {
    getOutput(deps).error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
