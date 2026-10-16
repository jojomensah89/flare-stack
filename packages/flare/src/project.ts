import { existsSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateFlareConfig, type FlareConfig } from "./config";
import {
  getArray,
  getObject,
  getProperty,
  parseJsonc,
  replaceStringNodes,
  type JsoncNode,
  type JsonValue,
} from "./jsonc";

export interface ProjectContext {
  root: string;
  config: FlareConfig;
  wranglerPath: string;
  wranglerSource: string;
  wranglerNode: JsoncNode;
  wrangler: Record<string, JsonValue>;
  role?: "web" | "server";
}

/** Select a deployment role without changing the topology or public Worker identity. */
export function getWorkerProject(project: ProjectContext, role: "web" | "server"): ProjectContext {
  if (project.config.preset !== "fullstack") return project;
  const path = join(project.root, "apps", role, "wrangler.jsonc");
  if (project.wranglerPath === path) return project;
  if (!existsSync(path)) throw new Error(`Missing ${role} Wrangler config: ${path}`);
  const source = readFileSync(path, "utf8");
  const node = parseJsonc(source, path);
  const wrangler = getObject(node);
  if (!wrangler) throw new Error(`${path} must contain a JSON object.`);
  return {
    ...project,
    role,
    wranglerPath: path,
    wranglerSource: source,
    wranglerNode: node,
    wrangler,
  };
}

/** Fullstack data and auth belong to the private backend, never the public asset Worker. */
export function getResourceProject(project: ProjectContext): ProjectContext {
  const resource = getWorkerProject(project, "server");
  if (project.config.preset === "fullstack") {
    const web = getWorkerProject(project, "web");
    if (web.wrangler.account_id !== resource.wrangler.account_id) {
      throw new Error(
        "Fullstack web and server configs must declare the same account_id (or both omit it). No resource operation was attempted.",
      );
    }
  }
  return resource;
}

export function findProjectRoot(startDirectory: string): string {
  let directory = resolve(startDirectory);
  while (true) {
    if (existsSync(join(directory, "flare.config.ts"))) return directory;
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error(
    `Could not find flare.config.ts above ${resolve(startDirectory)}. Run Flare from inside a Flare project.`,
  );
}

export async function loadProject(startDirectory: string): Promise<ProjectContext> {
  const root = findProjectRoot(startDirectory);
  const configFile = join(root, "flare.config.ts");
  // Bun caches file imports despite URL query strings. Use a distinct file and
  // source for each read; canonicalize macOS /var -> /private/var temp paths.
  const reloadId = randomUUID();
  const reloadFile = join(root, `.flare.config.${reloadId}.tmp.ts`);
  writeFileSync(reloadFile, `${readFileSync(configFile, "utf8")}\n// flare-reload: ${reloadId}\n`, {
    flag: "wx",
  });
  let configModule: { default: unknown };
  try {
    configModule = (await import(pathToFileURL(realpathSync(reloadFile)).href)) as {
      default: unknown;
    };
  } finally {
    unlinkSync(reloadFile);
  }
  const config = validateFlareConfig(configModule.default);
  if (config.preset === "extension") {
    return {
      root,
      config,
      wranglerPath: "",
      wranglerSource: "{}",
      wranglerNode: parseJsonc("{}", "extension"),
      wrangler: {},
    };
  }
  const wranglerPath =
    config.preset === "worker"
      ? join(root, "apps", "server", "wrangler.jsonc")
      : join(root, "apps", "web", "wrangler.jsonc");
  if (!existsSync(wranglerPath)) {
    throw new Error(`Missing Wrangler config: ${wranglerPath}`);
  }
  const wranglerSource = readFileSync(wranglerPath, "utf8");
  const wranglerNode = parseJsonc(wranglerSource, wranglerPath);
  const wrangler = getObject(wranglerNode);
  if (!wrangler) throw new Error(`${wranglerPath} must contain a JSON object.`);

  return { root, config, wranglerPath, wranglerSource, wranglerNode, wrangler };
}

export function requireApp(project: ProjectContext, command: string): void {
  const preset: string = project.config.preset;
  if (preset === "extension") {
    throw new Error(
      `The extension preset is a client-side browser extension and does not support \`${command}\`. Run \`bun run build\` or \`bun package\` instead.`,
    );
  }
  if (preset !== "app" && preset !== "fullstack" && preset !== "worker") {
    throw new Error(
      `${command} currently supports app, fullstack, and worker presets only. ${preset} requires a topology-specific lifecycle that is not enabled in this CLI version.`,
    );
  }
}

export function requireSupportedAppDatabase(project: ProjectContext, command: string): void {
  const preset: string = project.config.preset;
  if (preset === "extension") {
    throw new Error(`The extension preset is a client-side browser extension and has no database.`);
  }
  if (preset !== "app" && preset !== "fullstack" && preset !== "worker") {
    throw new Error(
      `${command} currently supports app, fullstack, and worker presets only. ${preset} requires a topology-specific lifecycle that is not enabled in this CLI version.`,
    );
  }
}

export function requireAppD1(project: ProjectContext, command: string): void {
  requireSupportedAppDatabase(project, command);
  if (project.config.database !== "d1") {
    throw new Error(
      `${command} requires the D1 profile, but this project selects ${project.config.database}.`,
    );
  }
}

export function requireAppNeon(project: ProjectContext, command: string): void {
  requireSupportedAppDatabase(project, command);
  if (project.config.database !== "neon") {
    throw new Error(
      `${command} requires the Neon profile, but this project selects ${project.config.database}.`,
    );
  }
}

export interface D1Binding {
  binding: string;
  databaseName: string;
  databaseId: string;
  node: JsoncNode;
}

function readD1Bindings(node: JsoncNode | undefined, context: string): D1Binding[] {
  const bindings = getArray(node) ?? [];
  const result: D1Binding[] = [];
  for (const bindingNode of bindings) {
    const bindingObject = getObject(bindingNode);
    if (!bindingObject) throw new Error(`${context} contains a D1 binding that is not an object.`);
    const binding = bindingObject.binding;
    const databaseName = bindingObject.database_name;
    const databaseId = bindingObject.database_id;
    if (typeof binding !== "string" || typeof databaseName !== "string") {
      throw new Error(`${context} D1 bindings must declare binding and database_name strings.`);
    }
    if (typeof databaseId !== "string" || !databaseId.trim()) {
      throw new Error(`${context} D1 binding ${binding} has no database_id.`);
    }
    result.push({ binding, databaseName, databaseId, node: bindingNode });
  }
  return result;
}

export function getAppD1Bindings(project: ProjectContext): {
  development: D1Binding;
  production: D1Binding;
  preview: D1Binding;
} {
  project = getResourceProject(project);
  const production = readD1Bindings(
    getProperty(project.wranglerNode, "d1_databases"),
    "Production",
  );
  if (production.length !== 1) {
    throw new Error(
      `The app preset requires exactly one production D1 binding; found ${production.length}.`,
    );
  }

  const environment = getProperty(project.wranglerNode, "env");
  const developmentEnvironment = getProperty(environment ?? project.wranglerNode, "development");
  if (!developmentEnvironment) {
    throw new Error(
      "The app preset requires an env.development D1 binding so local migrations match bun dev.",
    );
  }
  const development = readD1Bindings(
    getProperty(developmentEnvironment, "d1_databases"),
    "env.development",
  );
  if (development.length !== 1) {
    throw new Error(
      `env.development requires exactly one local D1 binding; found ${development.length}.`,
    );
  }
  const developmentBinding = development[0];
  const productionBinding = production[0];
  if (!developmentBinding || !productionBinding)
    throw new Error("The app preset is missing a required development or production D1 binding.");

  const previewsNode =
    project.config.preset === "fullstack"
      ? getProperty(environment ?? project.wranglerNode, "preview")
      : getProperty(project.wranglerNode, "previews");
  if (!previewsNode) {
    throw new Error(
      "The app preset requires a previews block with an isolated previews.d1_databases binding.",
    );
  }
  const preview = readD1Bindings(getProperty(previewsNode, "d1_databases"), "Worker Preview");
  if (preview.length !== 1) {
    throw new Error(
      `The app preset requires exactly one isolated previews.d1_databases binding; found ${preview.length}.`,
    );
  }
  const previewBinding = preview[0];
  if (!previewBinding) throw new Error("The app preset is missing its Worker Preview D1 binding.");

  const previewEnvironment = getProperty(environment ?? project.wranglerNode, "preview");
  if (previewEnvironment) {
    const persistentPreview = readD1Bindings(
      getProperty(previewEnvironment, "d1_databases"),
      "env.preview",
    );
    if (persistentPreview.length !== 1) {
      throw new Error(
        `env.preview requires exactly one isolated D1 binding; found ${persistentPreview.length}.`,
      );
    }
    if (
      !persistentPreview[0] ||
      persistentPreview[0].binding !== previewBinding.binding ||
      persistentPreview[0].databaseName !== previewBinding.databaseName ||
      persistentPreview[0].databaseId !== previewBinding.databaseId
    ) {
      throw new Error(
        "Worker Preview and env.preview must reference the same isolated D1 database for the app preset.",
      );
    }
  }
  if (
    new Set([
      developmentBinding.databaseId,
      productionBinding.databaseId,
      previewBinding.databaseId,
    ]).size !== 3
  ) {
    throw new Error(
      "Development, production, and Worker Preview D1 bindings must use separate database IDs.",
    );
  }
  if (
    new Set([
      developmentBinding.databaseName,
      productionBinding.databaseName,
      previewBinding.databaseName,
    ]).size !== 3
  ) {
    throw new Error(
      "Development, production, and Worker Preview D1 bindings must have different database names.",
    );
  }
  return {
    development: developmentBinding,
    production: productionBinding,
    preview: previewBinding,
  };
}

export function getRequiredSecrets(project: ProjectContext): string[] {
  project = getResourceProject(project);
  const targetLabel =
    project.config.preset === "worker" || project.config.preset === "fullstack"
      ? "apps/server/wrangler.jsonc"
      : "apps/web/wrangler.jsonc";
  const readNames = (environment: string, node: JsoncNode): string[] => {
    const secretsNode = getProperty(node, "secrets");
    const requiredNode = getProperty(secretsNode ?? node, "required");
    if (!requiredNode || requiredNode.type !== "array") {
      throw new Error(
        `${targetLabel} must declare secrets.required in ${environment}, including an empty array when none are required.`,
      );
    }
    const names = (getArray(requiredNode) ?? []).map((item) => item.value);
    if (!names.every((name) => typeof name === "string" && /^[A-Z][A-Z0-9_]*$/.test(name))) {
      throw new Error(
        `${targetLabel} secrets.required in ${environment} must contain only uppercase secret names.`,
      );
    }
    if (new Set(names).size !== names.length) {
      throw new Error(
        `${targetLabel} secrets.required in ${environment} must not contain duplicate secret names.`,
      );
    }
    return names as string[];
  };

  const production = readNames("production", project.wranglerNode);
  const environment = getProperty(project.wranglerNode, "env");
  for (const name of ["development", "preview"]) {
    const environmentNode = getProperty(environment ?? project.wranglerNode, name);
    if (!environmentNode) throw new Error(`${targetLabel} must declare env.${name}.`);
    const names = readNames(`env.${name}`, environmentNode);
    if (
      names.length !== production.length ||
      names.some((secret) => !production.includes(secret))
    ) {
      throw new Error(
        `env.${name}.secrets.required must match production secrets.required exactly.`,
      );
    }
  }
  return production;
}

export function getWorkerName(
  project: ProjectContext,
  environment: "production" | "preview" = "production",
): string {
  const baseName = project.wrangler.name;
  if (typeof baseName !== "string" || !/^[a-zA-Z0-9_-]+$/.test(baseName)) {
    throw new Error(`${project.wranglerPath} must declare a valid Worker name.`);
  }
  const preview = getObject(
    getProperty(getProperty(project.wranglerNode, "env") ?? project.wranglerNode, "preview"),
  );
  const name = environment === "preview" ? (preview?.name ?? `${baseName}-preview`) : baseName;
  if (typeof name !== "string" || !/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(`${project.wranglerPath} must declare a valid Worker name.`);
  }
  return name;
}

export function patchD1ResourceIds(
  source: string,
  rootNode: JsoncNode,
  resourceIds: Map<string, string>,
): string {
  const edits: Array<{ node: JsoncNode; value: string }> = [];
  const paths: JsoncNode[][] = [];

  const production = getArray(getProperty(rootNode, "d1_databases")) ?? [];
  paths.push(production);
  const previewsNode = getProperty(rootNode, "previews");
  const workerPreviews = getArray(getProperty(previewsNode ?? rootNode, "d1_databases")) ?? [];
  if (previewsNode) paths.push(workerPreviews);
  const environment = getProperty(rootNode, "env");
  const previewEnvironment = getProperty(environment ?? rootNode, "preview");
  if (previewEnvironment) {
    paths.push(getArray(getProperty(previewEnvironment, "d1_databases")) ?? []);
  }

  for (const bindings of paths) {
    for (const bindingNode of bindings) {
      const binding = getObject(bindingNode);
      const databaseName = binding?.database_name;
      if (typeof databaseName !== "string") continue;
      const resourceId = resourceIds.get(databaseName);
      if (!resourceId) continue;
      const idNode = getProperty(bindingNode, "database_id");
      if (!idNode || idNode.type !== "primitive" || typeof idNode.value !== "string") {
        throw new Error(
          `Cannot update D1 ID for ${databaseName}: database_id is missing or not a string.`,
        );
      }
      edits.push({ node: idNode, value: resourceId });
    }
  }

  const updatedNames = new Set(
    paths.flatMap((bindings) =>
      bindings.flatMap((bindingNode) => {
        const databaseName = getObject(bindingNode)?.database_name;
        return typeof databaseName === "string" && resourceIds.has(databaseName)
          ? [databaseName]
          : [];
      }),
    ),
  );
  for (const name of resourceIds.keys()) {
    if (!updatedNames.has(name))
      throw new Error(`No matching D1 binding found for database ${name}.`);
  }

  return replaceStringNodes(source, edits);
}
