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

export function callWhoAmI(project: ProjectContext, deps: CliDependencies): void {
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
  parseJsonOutput(result.stdout, "wrangler whoami --json");
}
