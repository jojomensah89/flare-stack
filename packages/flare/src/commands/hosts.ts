import { getObject, getProperty, parseJsonc, replaceStringNodes, type JsoncNode } from "../jsonc";
import { getWorkerName, type ProjectContext } from "../project";
import {
  defaultPromptLine,
  getEnv,
  getOption,
  parseJsonOutput,
  runTool,
  workerDirectory,
  withConfig,
  type CliDependencies,
} from "./common";

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const ACCOUNT_ID_PATTERN = /^[0-9a-f]{32}$/i;
const WORKERS_DEV_SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const WORKERS_SUBDOMAIN_PERMISSION = "Workers Scripts Read";
const WORKERS_SUBDOMAIN_REMEDIATION = `Set CLOUDFLARE_API_TOKEN (the token needs ${WORKERS_SUBDOMAIN_PERMISSION} permission; if Wrangler can access multiple accounts, also set CLOUDFLARE_ACCOUNT_ID or apps/web/wrangler.jsonc account_id), or pass both --public-host and --preview-host.`;

export interface CloudflareAuthHosts {
  production: string;
  preview: string;
}

export function configNodesByPath(root: JsoncNode, path: string[]): JsoncNode {
  let node = root;
  for (const part of path) {
    const next = getProperty(node, part);
    if (!next) throw new Error(`apps/web/wrangler.jsonc is missing ${path.join(".")}.`);
    node = next;
  }
  return node;
}

export function patchRuntimeVar(
  source: string,
  root: JsoncNode,
  path: string[],
  name: string,
  value: string,
): string {
  const vars = configNodesByPath(root, path);
  const valueNode = getProperty(vars, name);
  if (valueNode?.type !== "primitive" || typeof valueNode.value !== "string") {
    throw new Error(
      `apps/web/wrangler.jsonc must declare ${[...path, name].join(".")} as a string before setup.`,
    );
  }
  return replaceStringNodes(source, [{ node: valueNode, value }]);
}

export function patchRuntimeHosts(
  source: string,
  project: ProjectContext,
  production?: string,
  preview?: string,
): string {
  const node = parseJsonc(source, project.wranglerPath);
  let result = patchRuntimeVar(source, node, ["vars"], "FLARE_ENVIRONMENT", "production");
  let nextRoot = parseJsonc(result, project.wranglerPath);
  result = patchRuntimeVar(
    result,
    nextRoot,
    ["env", "preview", "vars"],
    "FLARE_ENVIRONMENT",
    "preview",
  );
  nextRoot = parseJsonc(result, project.wranglerPath);
  result = patchRuntimeVar(result, nextRoot, ["previews", "vars"], "FLARE_ENVIRONMENT", "preview");
  if (project.config.auth === "better-auth") {
    if (!production || !preview) {
      throw new Error("Auth-enabled projects require production and Preview host allowlists.");
    }
    nextRoot = parseJsonc(result, project.wranglerPath);
    result = patchRuntimeVar(result, nextRoot, ["vars"], "AUTH_ALLOWED_HOSTS", production);
    nextRoot = parseJsonc(result, project.wranglerPath);
    result = patchRuntimeVar(
      result,
      nextRoot,
      ["env", "preview", "vars"],
      "AUTH_ALLOWED_HOSTS",
      preview,
    );
    nextRoot = parseJsonc(result, project.wranglerPath);
    result = patchRuntimeVar(result, nextRoot, ["previews", "vars"], "AUTH_ALLOWED_HOSTS", preview);
    nextRoot = parseJsonc(result, project.wranglerPath);
    result = patchRuntimeVar(result, nextRoot, ["vars"], "AUTH_PROTOCOL", "https");
    nextRoot = parseJsonc(result, project.wranglerPath);
    result = patchRuntimeVar(
      result,
      nextRoot,
      ["env", "preview", "vars"],
      "AUTH_PROTOCOL",
      "https",
    );
    nextRoot = parseJsonc(result, project.wranglerPath);
    result = patchRuntimeVar(result, nextRoot, ["previews", "vars"], "AUTH_PROTOCOL", "https");
  }
  return result;
}

export function runtimeVars(
  project: ProjectContext,
  environment: "production" | "development" | "preview" | "worker-preview",
): Record<string, string> {
  const workerPreviews = getProperty(project.wranglerNode, "previews");
  const node =
    environment === "production"
      ? getProperty(project.wranglerNode, "vars")
      : environment === "worker-preview"
        ? workerPreviews
          ? getProperty(workerPreviews, "vars")
          : undefined
        : getProperty(
            getProperty(
              getProperty(project.wranglerNode, "env") ?? project.wranglerNode,
              environment,
            ) ?? project.wranglerNode,
            "vars",
          );
  const values = getObject(node);
  if (!values) throw new Error(`apps/web/wrangler.jsonc must declare vars for ${environment}.`);
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => {
      if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
        throw new Error(`apps/web/wrangler.jsonc vars.${name} in ${environment} must be a scalar.`);
      }
      return [name, String(value)];
    }),
  );
}

export function validateRuntimeVarParity(project: ProjectContext): void {
  const production = Object.keys(runtimeVars(project, "production")).sort();
  for (const environment of ["development", "preview", "worker-preview"] as const) {
    const keys = Object.keys(runtimeVars(project, environment)).sort();
    if (
      keys.length !== production.length ||
      keys.some((name, index) => name !== production[index])
    ) {
      const label = environment === "worker-preview" ? "previews" : `env.${environment}`;
      throw new Error(`vars keys for ${label} must match the top-level production vars keys.`);
    }
  }
}

export function parseHostList(
  input: string,
  label: string,
  options: { workerPreviewPattern?: boolean; workerName?: string } = {},
): string[] {
  const hosts = input
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
  if (hosts.length === 0) throw new Error(`${label} cannot be empty.`);
  for (const host of hosts) {
    if (host.includes("/") || /[@?#<>\s]/.test(host)) {
      throw new Error(
        `${label} must contain hostnames only (no scheme, path, placeholder, or whitespace): ${host}.`,
      );
    }
    if (host.includes("*")) {
      const prefix = options.workerName ? `*-${options.workerName}.` : "";
      const suffix = ".workers.dev";
      const zone =
        host.startsWith(prefix) && prefix ? host.slice(prefix.length, -suffix.length) : "";
      const labels = zone.split(".");
      if (
        !options.workerPreviewPattern ||
        !prefix ||
        !host.endsWith(suffix) ||
        host.indexOf("*") !== 0 ||
        (host.match(/\*/g)?.length ?? 0) !== 1 ||
        labels.length !== 1 ||
        labels.some((item) => !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(item))
      ) {
        throw new Error(
          `${label} wildcard must be a single Worker Preview pattern (*-${options.workerName ?? "<worker-name>"}.<workers.dev-subdomain>.workers.dev): ${host}.`,
        );
      }
      continue;
    }
    let parsed: URL;
    try {
      parsed = new URL(`https://${host}`);
    } catch {
      throw new Error(`${label} contains an invalid host: ${host}.`);
    }
    if (
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      parsed.host !== host.toLowerCase()
    ) {
      throw new Error(
        `${label} must contain exact hostnames without userinfo, query strings, or fragments: ${host}.`,
      );
    }
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      throw new Error(`${label} cannot include a localhost host for a remote environment.`);
    }
  }
  if (options.workerPreviewPattern && !hosts.some((host) => host.includes("*"))) {
    throw new Error(
      `${label} must include the exact Worker Preview hostname pattern *-${options.workerName ?? "<worker-name>"}.<workers.dev-subdomain>.workers.dev.`,
    );
  }
  return hosts;
}

export function validateRemoteHosts(project: ProjectContext): void {
  validateRuntimeVarParity(project);
  const productionVars = getObject(getProperty(project.wranglerNode, "vars"));
  const previewEnvironment = getProperty(
    getProperty(project.wranglerNode, "env") ?? project.wranglerNode,
    "preview",
  );
  const persistentPreviewVars = getObject(
    previewEnvironment ? getProperty(previewEnvironment, "vars") : undefined,
  );
  const previewVars = getObject(
    getProperty(getProperty(project.wranglerNode, "previews") ?? project.wranglerNode, "vars"),
  );
  if (
    productionVars?.FLARE_ENVIRONMENT !== "production" ||
    previewVars?.FLARE_ENVIRONMENT !== "preview" ||
    (persistentPreviewVars && persistentPreviewVars.FLARE_ENVIRONMENT !== "preview")
  ) {
    throw new Error(
      "Wrangler vars must set FLARE_ENVIRONMENT=production at top level and FLARE_ENVIRONMENT=preview in the Worker previews block (and env.preview when present).",
    );
  }
  if (project.config.auth !== "better-auth") return;

  const production = productionVars?.AUTH_ALLOWED_HOSTS;
  const preview = previewVars?.AUTH_ALLOWED_HOSTS;
  if (
    productionVars?.AUTH_PROTOCOL !== "https" ||
    previewVars?.AUTH_PROTOCOL !== "https" ||
    (persistentPreviewVars && persistentPreviewVars.AUTH_PROTOCOL !== "https")
  ) {
    throw new Error(
      "Auth-enabled production, Worker Preview, and env.preview vars must set AUTH_PROTOCOL=https.",
    );
  }
  for (const [environment, value] of [
    ["production", production],
    ["preview", preview],
  ] as const) {
    if (
      typeof value !== "string" ||
      !value.trim() ||
      value.includes("<") ||
      value.includes("placeholder")
    ) {
      throw new Error(
        `AUTH_ALLOWED_HOSTS for ${environment} is unresolved. Run flare setup cloudflare --public-host <host> --preview-host <pattern-or-host>; copy the exact hostname or Worker Preview pattern from Cloudflare, since Flare will not guess an account subdomain.`,
      );
    }
    const hosts = parseHostList(value, `AUTH_ALLOWED_HOSTS for ${environment}`, {
      workerPreviewPattern: environment === "preview",
      workerName: getWorkerName(project),
    });
    if (environment === "preview") {
      if (persistentPreviewVars?.AUTH_ALLOWED_HOSTS !== preview) {
        throw new Error(
          "env.preview.vars.AUTH_ALLOWED_HOSTS must match previews.vars.AUTH_ALLOWED_HOSTS.",
        );
      }
      const productionHosts = parseHostList(
        production as string,
        "AUTH_ALLOWED_HOSTS for production",
      );
      if (hosts.some((host) => productionHosts.includes(host))) {
        throw new Error(
          "Production and Preview AUTH_ALLOWED_HOSTS must not contain the same exact hostname.",
        );
      }
    }
  }
}

export async function resolveHostInput(
  args: string[],
  option: string,
  prompt: string,
  deps: CliDependencies,
  allowPreviewPattern = false,
  workerName?: string,
): Promise<string> {
  const supplied =
    getOption(args, option) ??
    getEnv(deps)[option === "--public-host" ? "FLARE_PUBLIC_HOST" : "FLARE_PREVIEW_HOST"];
  const options = { workerPreviewPattern: allowPreviewPattern, workerName };
  if (supplied) return parseHostList(supplied, option, options).join(",");
  const ask = deps.promptLine ?? defaultPromptLine;
  return parseHostList(await ask(prompt), option, options).join(",");
}

function configuredAccountId(project: ProjectContext, deps: CliDependencies): string | undefined {
  const configured = project.wrangler.account_id;
  const configuredAccountId =
    configured === undefined ? undefined : typeof configured === "string" ? configured.trim() : "";
  const environmentAccountId = getEnv(deps).CLOUDFLARE_ACCOUNT_ID?.trim();

  if (
    (configuredAccountId !== undefined && !ACCOUNT_ID_PATTERN.test(configuredAccountId)) ||
    (environmentAccountId !== undefined && !ACCOUNT_ID_PATTERN.test(environmentAccountId))
  ) {
    throw new Error(
      `Cloudflare account ID is missing or malformed. ${WORKERS_SUBDOMAIN_REMEDIATION}`,
    );
  }
  if (
    configuredAccountId &&
    environmentAccountId &&
    configuredAccountId.toLowerCase() !== environmentAccountId.toLowerCase()
  ) {
    throw new Error(
      `CLOUDFLARE_ACCOUNT_ID does not match apps/web/wrangler.jsonc account_id. ${WORKERS_SUBDOMAIN_REMEDIATION}`,
    );
  }

  return (environmentAccountId ?? configuredAccountId)?.toLowerCase();
}

function whoAmIAccountIds(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Wrangler whoami --json returned an invalid account response.");
  }
  const response = value as Record<string, unknown>;
  if (response.loggedIn === false) {
    throw new Error("Cloudflare authentication failed. Run `bun x wrangler login` and retry.");
  }
  if (response.loggedIn !== undefined && response.loggedIn !== true) {
    throw new Error("Wrangler whoami --json returned an invalid loggedIn value.");
  }
  if (response.accounts === undefined) return [];
  if (!Array.isArray(response.accounts)) {
    throw new Error("Wrangler whoami --json returned an invalid accounts list.");
  }
  return response.accounts.map((account, index) => {
    if (!account || typeof account !== "object" || Array.isArray(account)) {
      throw new Error(`Wrangler whoami --json returned an invalid account at index ${index}.`);
    }
    const id = (account as Record<string, unknown>).id;
    if (typeof id !== "string" || !ACCOUNT_ID_PATTERN.test(id)) {
      throw new Error(
        `Wrangler whoami --json returned a missing or malformed account ID at index ${index}.`,
      );
    }
    return id.toLowerCase();
  });
}

export function parseWhoAmIAccountId(
  value: unknown,
  project: ProjectContext,
  deps: CliDependencies,
  requireSelection = false,
): string | undefined {
  if (
    requireSelection &&
    (!value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      (value as Record<string, unknown>).loggedIn !== true ||
      !Array.isArray((value as Record<string, unknown>).accounts))
  ) {
    throw new Error(
      `Wrangler whoami --json did not return the documented logged-in account list. ${WORKERS_SUBDOMAIN_REMEDIATION}`,
    );
  }
  const accountIds = whoAmIAccountIds(value);
  if (new Set(accountIds).size !== accountIds.length) {
    throw new Error("Wrangler whoami --json returned duplicate account IDs.");
  }
  const explicitAccountId = configuredAccountId(project, deps);
  if (explicitAccountId) {
    if ((requireSelection || accountIds.length > 0) && !accountIds.includes(explicitAccountId)) {
      throw new Error(
        `The selected Cloudflare account ID does not match any account returned by Wrangler whoami. ${WORKERS_SUBDOMAIN_REMEDIATION}`,
      );
    }
    return explicitAccountId;
  }
  if (accountIds.length === 1) return accountIds[0]!;
  if (requireSelection) {
    const reason =
      accountIds.length === 0
        ? "Wrangler did not return an account ID"
        : "Wrangler returned multiple accounts and no account is selected";
    throw new Error(
      `${reason}. Set CLOUDFLARE_ACCOUNT_ID or apps/web/wrangler.jsonc account_id. ${WORKERS_SUBDOMAIN_REMEDIATION}`,
    );
  }
  return undefined;
}

export function parseWorkersDevSubdomainResponse(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Cloudflare returned an invalid Workers subdomain response.");
  }
  const envelope = value as Record<string, unknown>;
  const result = envelope.result;
  if (envelope.success !== true || !result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("Cloudflare did not return a Workers subdomain for this account.");
  }
  const subdomain = (result as Record<string, unknown>).subdomain;
  if (typeof subdomain !== "string" || !WORKERS_DEV_SUBDOMAIN_PATTERN.test(subdomain)) {
    throw new Error("Cloudflare returned a missing or malformed Workers subdomain.");
  }
  return subdomain;
}

export async function discoverWorkersDevSubdomain(
  project: ProjectContext,
  deps: CliDependencies,
  whoAmIAccountId?: string,
): Promise<string> {
  const token = getEnv(deps).CLOUDFLARE_API_TOKEN?.trim();
  if (!token) {
    throw new Error(
      `CLOUDFLARE_API_TOKEN is required for automatic hostname discovery. ${WORKERS_SUBDOMAIN_REMEDIATION}`,
    );
  }
  const explicitAccountId = configuredAccountId(project, deps);
  if (
    explicitAccountId &&
    whoAmIAccountId &&
    explicitAccountId.toLowerCase() !== whoAmIAccountId.toLowerCase()
  ) {
    throw new Error(
      `The selected Cloudflare account ID does not match Wrangler whoami. ${WORKERS_SUBDOMAIN_REMEDIATION}`,
    );
  }
  const accountId = (explicitAccountId ?? whoAmIAccountId)?.toLowerCase();
  if (!accountId || !ACCOUNT_ID_PATTERN.test(accountId)) {
    throw new Error(
      `Could not determine a valid Cloudflare account ID from Wrangler whoami or configuration. ${WORKERS_SUBDOMAIN_REMEDIATION}`,
    );
  }
  const fetcher = deps.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher(`${CLOUDFLARE_API_BASE}/accounts/${accountId}/workers/subdomain`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    throw new Error(
      `Could not query Cloudflare for this account's Workers subdomain. Check network access and API credentials. ${WORKERS_SUBDOMAIN_REMEDIATION}`,
    );
  }
  if (!response.ok) {
    throw new Error(
      `Cloudflare Workers subdomain discovery failed with HTTP ${response.status}. ${WORKERS_SUBDOMAIN_REMEDIATION}`,
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(
      `Cloudflare returned invalid JSON for the Workers subdomain. ${WORKERS_SUBDOMAIN_REMEDIATION}`,
    );
  }
  try {
    return parseWorkersDevSubdomainResponse(payload);
  } catch {
    throw new Error(
      `Cloudflare returned a missing or malformed Workers subdomain. ${WORKERS_SUBDOMAIN_REMEDIATION}`,
    );
  }
}

function hostOverride(args: string[], option: string, deps: CliDependencies): string | undefined {
  const fromArgs = getOption(args, option);
  const fromEnvironment =
    getEnv(deps)[option === "--public-host" ? "FLARE_PUBLIC_HOST" : "FLARE_PREVIEW_HOST"];
  return fromArgs ?? fromEnvironment;
}

export async function resolveCloudflareAuthHosts(
  args: string[],
  project: ProjectContext,
  deps: CliDependencies,
  whoAmIAccountId?: string,
): Promise<CloudflareAuthHosts> {
  const workerName = getWorkerName(project);
  const productionOverride = hostOverride(args, "--public-host", deps);
  const previewOverride = hostOverride(args, "--preview-host", deps);
  const subdomain =
    productionOverride !== undefined && previewOverride !== undefined
      ? undefined
      : await discoverWorkersDevSubdomain(project, deps, whoAmIAccountId);
  const production = parseHostList(
    productionOverride ?? `${workerName}.${subdomain}.workers.dev`,
    "production AUTH_ALLOWED_HOSTS",
  ).join(",");
  const preview = parseHostList(
    previewOverride ?? `*-${workerName}.${subdomain}.workers.dev`,
    "preview AUTH_ALLOWED_HOSTS",
    { workerPreviewPattern: true, workerName },
  ).join(",");
  const productionHosts = parseHostList(production, "production AUTH_ALLOWED_HOSTS");
  const previewHosts = parseHostList(preview, "preview AUTH_ALLOWED_HOSTS", {
    workerPreviewPattern: true,
    workerName,
  });
  if (productionHosts.some((host) => previewHosts.includes(host))) {
    throw new Error(
      "Production and Preview AUTH_ALLOWED_HOSTS must not contain the same exact hostname.",
    );
  }
  return { production, preview };
}

export function callWhoAmI(
  project: ProjectContext,
  deps: CliDependencies,
  requireAccountSelection = false,
): string | undefined {
  const result = runTool(
    deps,
    "wrangler",
    withConfig(project, ["whoami", "--json"]),
    workerDirectory(project),
  );
  if (result.status !== 0) {
    throw new Error("Cloudflare authentication failed. Run `bun x wrangler login` and retry.");
  }
  if (!result.stdout.trim()) {
    throw new Error("Wrangler authenticated without returning account information.");
  }
  const payload = parseJsonOutput(result.stdout, "wrangler whoami --json");
  return parseWhoAmIAccountId(payload, project, deps, requireAccountSelection);
}

export function validateHostOverrides(
  args: string[],
  project: ProjectContext,
  deps: CliDependencies,
): void {
  const workerName = getWorkerName(project);
  const productionOverride = hostOverride(args, "--public-host", deps);
  const previewOverride = hostOverride(args, "--preview-host", deps);
  const production =
    productionOverride !== undefined
      ? parseHostList(productionOverride, "production AUTH_ALLOWED_HOSTS")
      : undefined;
  const preview =
    previewOverride !== undefined
      ? parseHostList(previewOverride, "preview AUTH_ALLOWED_HOSTS", {
          workerPreviewPattern: true,
          workerName,
        })
      : undefined;
  if (production && preview && production.some((host) => preview.includes(host))) {
    throw new Error(
      "Production and Preview AUTH_ALLOWED_HOSTS must not contain the same exact hostname.",
    );
  }
}

export function hasCompleteHostOverrides(args: string[], deps: CliDependencies): boolean {
  return (
    hostOverride(args, "--public-host", deps) !== undefined &&
    hostOverride(args, "--preview-host", deps) !== undefined
  );
}
