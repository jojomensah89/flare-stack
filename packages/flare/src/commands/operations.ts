import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  clearCloudflareEnvironment,
  defaultConfirm,
  expectOnlyFlags,
  getOutput,
  parseJsonOutput,
  printCommandOutput,
  runTool,
  serverDirectory,
  webDirectory,
  type CliDependencies,
} from "./common";
import { getProperty, parseJsonc, type JsoncNode } from "../jsonc";
import { requireApp, type ProjectContext } from "../project";
import { assertCommandSucceeded } from "../runner";

export type WorkerRole = "web" | "server";

export interface WorkerVersionRecord {
  id: string;
  percentage: number;
  tag?: string;
  message?: string;
  createdOn?: string;
  availability: "available" | "expired" | "unknown";
  availabilityMessage?: string;
}

export interface WorkerDeploymentRecord {
  role: WorkerRole;
  workerName: string;
  createdOn: string;
  author?: string;
  source?: string;
  message?: string;
  tag?: string;
  versions: WorkerVersionRecord[];
}

export interface PairedRelease {
  tag: string;
  web: WorkerVersionRecord;
  server: WorkerVersionRecord;
  createdOn: string;
}

interface WorkerConfig {
  path: string;
  directory: string;
  node: JsoncNode;
  workerName: string;
}

interface VersionView {
  id?: string;
  annotations?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

interface RawDeployment {
  id?: unknown;
  created_on?: unknown;
  author_email?: unknown;
  source?: unknown;
  annotations?: unknown;
  versions?: unknown;
}

interface RawVersionTraffic {
  version_id?: unknown;
  percentage?: unknown;
}

const MUTABLE_RESOURCE_SECTIONS = [
  "d1_databases",
  "kv_namespaces",
  "r2_buckets",
  "queues",
  "services",
  "hyperdrive",
  "vectorize",
  "ai_search_namespaces",
  "ai_search",
  "dispatch_namespaces",
  "workflows",
  "durable_objects",
  "analytics_engine_datasets",
  "send_email",
] as const;

function getWorkerConfig(project: ProjectContext, role: WorkerRole): WorkerConfig {
  if (role === "web" || project.config.preset !== "fullstack") {
    const workerName = project.wrangler.name;
    if (typeof workerName !== "string" || !/^[a-zA-Z0-9_-]+$/.test(workerName)) {
      throw new Error(`The ${role} Wrangler config must declare a valid Worker name.`);
    }
    return {
      path: project.wranglerPath,
      directory:
        project.config.preset === "worker" ? serverDirectory(project) : webDirectory(project),
      node: project.wranglerNode,
      workerName,
    };
  }

  const path = join(serverDirectory(project), "wrangler.jsonc");
  if (!existsSync(path)) throw new Error(`Missing server Wrangler config: ${path}`);
  const node = parseJsonc(readFileSync(path, "utf8"), path);
  const workerName = getProperty(node, "name")?.value;
  if (typeof workerName !== "string" || !/^[a-zA-Z0-9_-]+$/.test(workerName)) {
    throw new Error(`The server Wrangler config must declare a valid Worker name.`);
  }
  return { path, directory: serverDirectory(project), node, workerName };
}

function withWorkerConfig(config: WorkerConfig, args: string[]): string[] {
  return [...args, "--config", config.path];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function textField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getAnnotation(annotations: unknown, name: string): string | undefined {
  return textField(asRecord(annotations)?.[name]);
}

function looksLikeMissingVersion(message: string): boolean {
  return /not found|does not exist|no version|unknown version|404|expired|no longer available/i.test(
    message,
  );
}

function releaseTag(value: string | undefined): string | undefined {
  return value && /^flare:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value) ? value : undefined;
}

function sortNewest<T extends { createdOn: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => right.createdOn.localeCompare(left.createdOn));
}

function unwrapDeployments(value: unknown): RawDeployment[] {
  const candidate = Array.isArray(value)
    ? value
    : Array.isArray(asRecord(value)?.deployments)
      ? (asRecord(value)?.deployments as unknown[])
      : undefined;
  if (!candidate) {
    throw new Error(
      "Wrangler deployments list returned an unknown JSON shape; refusing to infer history.",
    );
  }
  return candidate.map((item) => {
    const record = asRecord(item) as RawDeployment | undefined;
    if (
      !record ||
      typeof record.created_on !== "string" ||
      !Array.isArray(record.versions) ||
      !record.versions.every((entry) => {
        const version = asRecord(entry) as RawVersionTraffic | undefined;
        return (
          !!version &&
          typeof version.version_id === "string" &&
          typeof version.percentage === "number" &&
          Number.isFinite(version.percentage)
        );
      })
    ) {
      throw new Error(
        "Wrangler deployments list returned an incomplete deployment; refusing to infer history.",
      );
    }
    return record;
  });
}

function unwrapVersion(value: unknown): VersionView | undefined {
  const record = asRecord(value);
  if (!record || typeof record.id !== "string") return undefined;
  return {
    id: record.id,
    annotations: asRecord(record.annotations),
    metadata: asRecord(record.metadata),
  };
}

async function inspectVersion(
  project: ProjectContext,
  deps: CliDependencies,
  config: WorkerConfig,
  id: string,
): Promise<{
  view?: VersionView;
  availability: WorkerVersionRecord["availability"];
  message?: string;
}> {
  const result = runTool(
    deps,
    "wrangler",
    withWorkerConfig(config, ["versions", "view", id, "--json"]),
    config.directory,
    { env: clearCloudflareEnvironment(deps) },
  );
  if (result.status === 0) {
    try {
      const view = unwrapVersion(parseJsonOutput(result.stdout, `Wrangler version ${id}`));
      if (view?.id === id) return { view, availability: "available" };
      return {
        availability: "unknown",
        message: "Wrangler did not return the requested version ID.",
      };
    } catch (error) {
      return {
        availability: "unknown",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
  const detail = `${result.stderr}\n${result.stdout}`.trim();
  return {
    availability: looksLikeMissingVersion(detail) ? "expired" : "unknown",
    ...(detail ? { message: detail } : {}),
  };
}

export async function readWorkerDeploymentHistory(
  project: ProjectContext,
  deps: CliDependencies,
  role: WorkerRole,
): Promise<WorkerDeploymentRecord[]> {
  const config = getWorkerConfig(project, role);
  const listResult = runTool(
    deps,
    "wrangler",
    withWorkerConfig(config, ["deployments", "list", "--json"]),
    config.directory,
    { env: clearCloudflareEnvironment(deps) },
  );
  assertCommandSucceeded(listResult, `${role} Worker deployment history`);
  const rawDeployments = unwrapDeployments(
    parseJsonOutput(listResult.stdout, "Wrangler deployments list"),
  );
  const versionCache = new Map<string, Awaited<ReturnType<typeof inspectVersion>>>();

  const records: WorkerDeploymentRecord[] = [];
  for (const deployment of rawDeployments) {
    const traffic = deployment.versions as RawVersionTraffic[];
    const versions: WorkerVersionRecord[] = [];
    for (const item of traffic) {
      const id = item.version_id as string;
      let inspected = versionCache.get(id);
      if (!inspected) {
        inspected = await inspectVersion(project, deps, config, id);
        versionCache.set(id, inspected);
      }
      const versionTag =
        releaseTag(getAnnotation(inspected.view?.annotations, "workers/tag")) ??
        releaseTag(getAnnotation(deployment.annotations, "workers/tag"));
      const versionMessage =
        getAnnotation(inspected.view?.annotations, "workers/message") ??
        getAnnotation(deployment.annotations, "workers/message");
      const createdOn = textField(inspected.view?.metadata?.created_on);
      versions.push({
        id,
        percentage: item.percentage as number,
        ...(versionTag ? { tag: versionTag } : {}),
        ...(versionMessage ? { message: versionMessage } : {}),
        ...(createdOn ? { createdOn } : {}),
        availability: inspected.availability,
        ...(inspected.message ? { availabilityMessage: inspected.message } : {}),
      });
    }
    const tag =
      releaseTag(getAnnotation(deployment.annotations, "workers/tag")) ??
      (versions.length === 1 ? versions[0]?.tag : undefined);
    records.push({
      role,
      workerName: config.workerName,
      createdOn: deployment.created_on as string,
      ...(textField(deployment.author_email) ? { author: textField(deployment.author_email) } : {}),
      ...(textField(deployment.source) ? { source: textField(deployment.source) } : {}),
      ...(getAnnotation(deployment.annotations, "workers/message")
        ? { message: getAnnotation(deployment.annotations, "workers/message") }
        : {}),
      ...(tag ? { tag } : {}),
      versions,
    });
  }
  return sortNewest(records);
}

function workerVersionCandidates(
  history: WorkerDeploymentRecord[],
): Map<string, WorkerVersionRecord[]> {
  const result = new Map<string, WorkerVersionRecord[]>();
  for (const deployment of history) {
    for (const version of deployment.versions) {
      if (!version.tag) continue;
      const versions = result.get(version.tag) ?? [];
      if (!versions.some((existing) => existing.id === version.id)) versions.push(version);
      result.set(version.tag, versions);
    }
  }
  return result;
}

export function pairFullstackReleases(
  webHistory: WorkerDeploymentRecord[],
  serverHistory: WorkerDeploymentRecord[],
): PairedRelease[] {
  const webCandidates = workerVersionCandidates(webHistory);
  const serverCandidates = workerVersionCandidates(serverHistory);
  const tags = [...webCandidates.keys()].filter((tag) => serverCandidates.has(tag));
  const pairs: PairedRelease[] = [];
  for (const tag of tags) {
    const webVersions = webCandidates.get(tag) ?? [];
    const serverVersions = serverCandidates.get(tag) ?? [];
    if (webVersions.length !== 1 || serverVersions.length !== 1) continue;
    const web = webVersions[0];
    const server = serverVersions[0];
    if (!web || !server || web.percentage !== 100 || server.percentage !== 100) continue;
    const webDate =
      web.createdOn ??
      webHistory.find((item) => item.versions.some((version) => version.id === web.id))?.createdOn;
    const serverDate =
      server.createdOn ??
      serverHistory.find((item) => item.versions.some((version) => version.id === server.id))
        ?.createdOn;
    const createdOn = [webDate, serverDate]
      .filter((date): date is string => !!date)
      .sort()
      .at(-1);
    pairs.push({
      tag,
      web,
      server,
      createdOn: createdOn ?? "",
    });
  }
  return pairs.sort((left, right) => right.createdOn.localeCompare(left.createdOn));
}

function displaySource(source: string | undefined): string {
  if (!source) return "unknown source";
  if (source === "wrangler") return "Wrangler";
  if (source === "api") return "API";
  if (source === "dash") return "Dashboard";
  if (source === "terraform") return "Terraform";
  return source;
}

function formatWorkerHistory(
  output: ReturnType<typeof getOutput>,
  label: string,
  history: WorkerDeploymentRecord[],
): void {
  output.log(`${label} (${history[0]?.workerName ?? "Worker"}):`);
  if (history.length === 0) {
    output.log("  No deployment records returned by Wrangler.");
    return;
  }
  for (const deployment of history) {
    const versionSummary = deployment.versions.map((version) => {
      const tag = version.tag ? ` tag=${version.tag}` : "";
      const status =
        version.availability === "expired"
          ? " [no longer retained]"
          : version.availability === "unknown"
            ? " [retention unverified]"
            : "";
      const percentage = Number.isInteger(version.percentage)
        ? `${version.percentage}%`
        : `${version.percentage}%`;
      return `${percentage} ${version.id}${tag}${status}`;
    });
    output.log(
      `  ${deployment.createdOn} · ${displaySource(deployment.source)} · ${versionSummary.join(", ")}${deployment.message ? ` · ${deployment.message}` : ""}`,
    );
  }
}

export async function commandDeployments(
  project: ProjectContext,
  deps: CliDependencies,
  args: string[],
): Promise<number> {
  expectOnlyFlags(args, []);
  requireApp(project, "flare deployments");
  const output = getOutput(deps);
  if (project.config.preset === "fullstack") {
    const webHistory = await readWorkerDeploymentHistory(project, deps, "web");
    const serverHistory = await readWorkerDeploymentHistory(project, deps, "server");
    output.log("Production deployment history (from Wrangler; read-only):");
    formatWorkerHistory(output, "Web Worker", webHistory);
    formatWorkerHistory(output, "Server Worker", serverHistory);
    const pairs = pairFullstackReleases(webHistory, serverHistory);
    output.log("Paired fullstack releases (matching flare:<release-id> version tags):");
    if (pairs.length === 0)
      output.log("  No complete paired release tags were reported by Wrangler.");
    for (const pair of pairs) {
      const retention = (version: WorkerVersionRecord) =>
        version.availability === "available"
          ? "retained"
          : version.availability === "expired"
            ? "expired"
            : "retention unverified";
      output.log(
        `  ${pair.tag} · web ${pair.web.id} (${retention(pair.web)}) · server ${pair.server.id} (${retention(pair.server)})`,
      );
    }
    return 0;
  }
  const role: WorkerRole = project.config.preset === "worker" ? "server" : "web";
  const history = await readWorkerDeploymentHistory(project, deps, role);
  output.log("Production deployment history (from Wrangler; read-only):");
  formatWorkerHistory(output, `${role === "web" ? "Web" : "Server"} Worker`, history);
  return 0;
}

interface ResourceDeclaration {
  kind: string;
  binding: string;
  name?: string;
  id?: string;
}

function declarationsFrom(value: unknown, kind: string): ResourceDeclaration[] {
  const records: unknown[] = [];
  if (Array.isArray(value)) records.push(...value);
  else if (kind === "ai" && value && typeof value === "object") records.push({ binding: "AI" });
  else return [];

  return records.flatMap((entry) => {
    const item = asRecord(entry);
    if (!item) return [];
    const binding = textField(item.binding) ?? textField(item.name) ?? "(binding unspecified)";
    const name =
      textField(item.database_name) ??
      textField(item.bucket_name) ??
      textField(item.queue) ??
      textField(item.service) ??
      textField(item.index_name) ??
      textField(item.namespace) ??
      textField(item.dataset) ??
      textField(item.class_name) ??
      textField(item.name);
    const id = textField(item.database_id) ?? textField(item.id);
    return [{ kind, binding, ...(name ? { name } : {}), ...(id ? { id } : {}) }];
  });
}

function declarationsForNode(node: JsoncNode | undefined): ResourceDeclaration[] {
  const value = asRecord(node?.value);
  if (!value) return [];
  const declarations: ResourceDeclaration[] = [];
  for (const kind of MUTABLE_RESOURCE_SECTIONS) {
    const section = value[kind];
    if (kind === "queues") {
      const queues = asRecord(section);
      if (!queues) continue;
      declarations.push(...declarationsFrom(queues.producers, "queues"));
      continue;
    }
    if (kind === "durable_objects") {
      const objects = asRecord(section);
      declarations.push(...declarationsFrom(objects?.bindings, kind));
      continue;
    }
    declarations.push(...declarationsFrom(section, kind));
  }
  return declarations;
}

function nodeForChild(node: JsoncNode, parent: string, child: string): JsoncNode | undefined {
  const parentNode = getProperty(node, parent);
  return parentNode ? getProperty(parentNode, child) : undefined;
}

function formatDeclarations(
  output: ReturnType<typeof getOutput>,
  label: string,
  declarations: ResourceDeclaration[],
): void {
  output.log(`  ${label}:`);
  if (declarations.length === 0) {
    output.log("    none declared");
    return;
  }
  for (const item of declarations) {
    const name = item.name ? ` name=${item.name}` : "";
    const id = item.id ? ` id=${item.id}` : "";
    output.log(`    ${item.kind} binding=${item.binding}${name}${id}`);
  }
}

export async function commandResources(
  project: ProjectContext,
  deps: CliDependencies,
  args: string[],
): Promise<number> {
  expectOnlyFlags(args, []);
  requireApp(project, "flare resources");
  const output = getOutput(deps);
  const roles: WorkerRole[] =
    project.config.preset === "fullstack"
      ? ["web", "server"]
      : [project.config.preset === "worker" ? "server" : "web"];
  output.log(
    "Declared Cloudflare resources (read from Wrangler config; no secret files or values are read):",
  );
  for (const role of roles) {
    const worker = getWorkerConfig(project, role);
    output.log(`${role === "web" ? "Web" : "Server"} Worker ${worker.workerName} · ${worker.path}`);
    formatDeclarations(output, "production", declarationsForNode(worker.node));
    formatDeclarations(
      output,
      "local/development",
      declarationsForNode(nodeForChild(worker.node, "env", "development")),
    );
    formatDeclarations(
      output,
      "Worker Previews",
      declarationsForNode(getProperty(worker.node, "previews")),
    );
    formatDeclarations(
      output,
      "persistent preview environment",
      declarationsForNode(nodeForChild(worker.node, "env", "preview")),
    );
  }
  output.log("Secret values are not listed; use `flare secrets list` to inspect secret names.");
  return 0;
}

function assertPreviewResourcesAreIsolated(worker: WorkerConfig): void {
  const production = declarationsForNode(worker.node);
  const preview = declarationsForNode(getProperty(worker.node, "previews"));
  const productionByBinding = new Map(
    production.map((item) => [`${item.kind}:${item.binding}`, item]),
  );
  const previewByBinding = new Map(preview.map((item) => [`${item.kind}:${item.binding}`, item]));
  for (const [key, item] of productionByBinding) {
    const previewItem = previewByBinding.get(key);
    if (!previewItem) {
      throw new Error(
        `Refusing preview cleanup: production resource ${item.kind} binding ${item.binding} has no isolated Worker Preview declaration in ${worker.path}.`,
      );
    }
    if ((!item.id && !item.name) || (!previewItem.id && !previewItem.name)) {
      throw new Error(
        `Refusing preview cleanup: cannot verify that ${item.kind} binding ${item.binding} is isolated from production.`,
      );
    }
    if (
      (item.id && previewItem.id && item.id === previewItem.id) ||
      (item.name && previewItem.name && item.name.toLowerCase() === previewItem.name.toLowerCase())
    ) {
      throw new Error(
        `Refusing preview cleanup: preview ${item.kind} binding ${item.binding} points to the production resource ${item.name ?? item.id ?? item.binding}.`,
      );
    }
  }
}

export async function commandPreviewClean(
  project: ProjectContext,
  deps: CliDependencies,
  args: string[],
): Promise<number> {
  expectOnlyFlags(args, ["--name"]);
  requireApp(project, "flare preview clean");
  if (project.config.preset === "fullstack") {
    throw new Error(
      "flare preview clean does not delete fullstack's persistent preview Workers or resources. Clean that environment only through a reviewed resource plan.",
    );
  }
  const name = args.includes("--name")
    ? args[args.indexOf("--name") + 1]
    : args.find((arg) => arg.startsWith("--name="))?.slice("--name=".length);
  if (!name || name.length > 63 || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
    throw new Error("Usage: flare preview clean --name <explicit-preview-name>.");
  }
  const worker = getWorkerConfig(project, project.config.preset === "worker" ? "server" : "web");
  if (name.toLowerCase() === worker.workerName.toLowerCase()) {
    throw new Error(
      "Refusing preview cleanup: the preview name matches the configured production Worker name.",
    );
  }
  assertPreviewResourcesAreIsolated(worker);

  const output = getOutput(deps);
  output.log(
    `Preview cleanup plan: delete Wrangler Preview ${JSON.stringify(name)} and its Preview deployments from Worker ${worker.workerName}. Configured D1, KV, R2, queue, and other resources will not be deleted.`,
  );
  const confirm = deps.confirm ?? defaultConfirm;
  if (!(await confirm(`Delete the named Worker Preview ${name}?`))) {
    output.log("Preview cleanup cancelled; no Cloudflare command was run.");
    return 1;
  }

  const result = runTool(
    deps,
    "wrangler",
    withWorkerConfig(worker, [
      "preview",
      "delete",
      "--name",
      name,
      "--worker-name",
      worker.workerName,
      "--skip-confirmation",
    ]),
    worker.directory,
    { env: clearCloudflareEnvironment(deps) },
  );
  printCommandOutput(output, result);
  assertCommandSucceeded(result, "Wrangler Preview cleanup");
  output.log(
    `Deleted Wrangler Preview ${JSON.stringify(name)}. Declared resources were left intact.`,
  );
  return 0;
}

export async function loadPairedReleaseHistory(
  project: ProjectContext,
  deps: CliDependencies,
): Promise<PairedRelease[]> {
  const [webHistory, serverHistory] = await Promise.all([
    readWorkerDeploymentHistory(project, deps, "web"),
    readWorkerDeploymentHistory(project, deps, "server"),
  ]);
  return pairFullstackReleases(webHistory, serverHistory);
}

export async function resolvePairedRollbackRelease(
  project: ProjectContext,
  deps: CliDependencies,
  requestedRelease?: string,
): Promise<PairedRelease> {
  const [webHistory, serverHistory] = await Promise.all([
    readWorkerDeploymentHistory(project, deps, "web"),
    readWorkerDeploymentHistory(project, deps, "server"),
  ]);
  const pairs = pairFullstackReleases(webHistory, serverHistory);
  let selected: PairedRelease | undefined;

  if (requestedRelease) {
    const tag = requestedRelease.startsWith("flare:")
      ? releaseTag(requestedRelease)
      : releaseTag(`flare:${requestedRelease}`);
    if (!tag) throw new Error("--release must be a release ID or a flare:<release-id> tag.");
    selected = pairs.find((pair) => pair.tag === tag);
    if (!selected) {
      throw new Error(
        `No paired production deployment with tag ${tag} appears in the Wrangler history for both Workers.`,
      );
    }
  } else {
    const currentWebId =
      webHistory[0]?.versions.length === 1 ? webHistory[0].versions[0]?.id : undefined;
    const currentServerId =
      serverHistory[0]?.versions.length === 1 ? serverHistory[0].versions[0]?.id : undefined;
    selected = pairs.find(
      (pair) => pair.web.id !== currentWebId || pair.server.id !== currentServerId,
    );
    if (!selected) {
      throw new Error(
        "No earlier complete paired production release is available in Wrangler history. Deployments without a shared flare:<release-id> tag cannot be paired safely.",
      );
    }
  }

  if (selected.web.availability === "expired" || selected.server.availability === "expired") {
    const expired = [
      ...(selected.web.availability === "expired" ? [`web ${selected.web.id}`] : []),
      ...(selected.server.availability === "expired" ? [`server ${selected.server.id}`] : []),
    ];
    throw new Error(
      `Refusing rollback of ${selected.tag}: paired version(s) no longer retained by Cloudflare: ${expired.join(", ")}. No Worker was changed.`,
    );
  }
  if (selected.web.availability !== "available" || selected.server.availability !== "available") {
    const unknown = [
      ...(selected.web.availability !== "available" ? [`web ${selected.web.id}`] : []),
      ...(selected.server.availability !== "available" ? [`server ${selected.server.id}`] : []),
    ];
    throw new Error(
      `Refusing rollback of ${selected.tag}: Cloudflare retention could not be verified for ${unknown.join(", ")}. No Worker was changed.`,
    );
  }
  return selected;
}
