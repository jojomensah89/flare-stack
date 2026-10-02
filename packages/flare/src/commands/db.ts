import { randomUUID } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseEnvText } from "../env";
import {
  getAppD1Bindings,
  requireAppD1,
  requireSupportedAppDatabase,
  type D1Binding,
  type ProjectContext,
} from "../project";
import { assertCommandSucceeded, commandError, type RunResult } from "../runner";
import {
  collectObjects,
  defaultConfirm,
  ensureProductionEnvironment,
  expectOnlyFlags,
  getEnv,
  getOption,
  getOutput,
  hasOption,
  makeEnv,
  parseJsonOutput,
  printCommandOutput,
  runTool,
  workerDirectory,
  withConfig,
  type CliDependencies,
  type D1DatabaseRecord,
  type MigrationState,
} from "./common";

export type LocalD1PathKind = "missing" | "directory" | "symlink" | "file" | "other";

/** Filesystem seam for deterministic reset safety and recovery fixtures. */
export interface LocalD1StateFileSystem {
  kind(path: string): LocalD1PathKind;
  realpath(path: string): string;
  mkdir(path: string): void;
  rename(from: string, to: string): void;
  removeTree(path: string): void;
  copyTree(from: string, to: string): void;
}

const localD1StateFileSystem: LocalD1StateFileSystem = {
  kind(path) {
    try {
      const stats = lstatSync(path);
      if (stats.isSymbolicLink()) return "symlink";
      if (stats.isDirectory()) return "directory";
      if (stats.isFile()) return "file";
      return "other";
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
      throw error;
    }
  },
  realpath: (path) => realpathSync(path),
  mkdir: (path) => mkdirSync(path),
  rename: (from, to) => renameSync(from, to),
  removeTree: (path) => rmSync(path, { recursive: true, force: false }),
  copyTree: (from, to) => cpSync(from, to, { recursive: true }),
};

function equalPath(left: string, right: string): boolean {
  const a = resolve(left);
  const b = resolve(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/**
 * Resolve and validate the one local D1 persistence path owned by this project.
 * The project root may itself be reached through a symlink, but .wrangler and
 * state must be real directories directly below that resolved project root.
 */
export function getCanonicalLocalD1StatePath(
  project: ProjectContext,
  fileSystem: LocalD1StateFileSystem = localD1StateFileSystem,
): string {
  const root = resolve(project.root);
  const rootKind = fileSystem.kind(root);
  if (rootKind !== "directory" && rootKind !== "symlink") {
    throw new Error(`Cannot reset local D1 state: project root ${root} is not a real directory.`);
  }
  const canonicalRoot = resolve(fileSystem.realpath(root));
  if (fileSystem.kind(canonicalRoot) !== "directory") {
    throw new Error(
      `Cannot reset local D1 state: project root ${root} does not resolve to a directory.`,
    );
  }
  const wranglerDirectory = join(canonicalRoot, ".wrangler");
  const statePath = join(wranglerDirectory, "state");

  const wranglerKind = fileSystem.kind(wranglerDirectory);
  if (wranglerKind !== "missing" && wranglerKind !== "directory") {
    throw new Error(
      `Refusing local D1 operation: ${wranglerDirectory} must be a project-owned directory, not a ${wranglerKind}.`,
    );
  }
  if (
    wranglerKind === "directory" &&
    !equalPath(fileSystem.realpath(wranglerDirectory), wranglerDirectory)
  ) {
    throw new Error(
      `Refusing local D1 operation: ${wranglerDirectory} resolves outside the project root.`,
    );
  }

  const stateKind = fileSystem.kind(statePath);
  if (stateKind !== "missing" && stateKind !== "directory") {
    throw new Error(
      `Refusing local D1 operation: ${statePath} must be a project-owned directory, not a ${stateKind}.`,
    );
  }
  if (stateKind === "directory" && !equalPath(fileSystem.realpath(statePath), statePath)) {
    throw new Error(`Refusing local D1 operation: ${statePath} resolves outside the project root.`);
  }
  return statePath;
}

function makeResetArtifactPath(
  statePath: string,
  kind: "backup" | "failed",
  idFactory: () => string,
  fileSystem: LocalD1StateFileSystem,
  prefix = "flare-reset",
): string {
  const parent = dirname(statePath);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = join(parent, `${basename(statePath)}.${prefix}-${kind}-${idFactory()}`);
    if (dirname(candidate) !== parent || fileSystem.kind(candidate) !== "missing") continue;
    return candidate;
  }
  throw new Error(`Could not reserve a unique local D1 ${kind} path beside ${statePath}.`);
}

export interface LocalD1ResetResult {
  statePath: string;
  retainedBackup?: string;
}

export interface LocalD1SeedResult {
  statePath: string;
  retainedBackup?: string;
}

/** Move aside local state, replay migrations into a clean directory, then discard the snapshot. */
export async function resetLocalD1State(
  project: ProjectContext,
  replayMigrations: () => Promise<void>,
  fileSystem: LocalD1StateFileSystem = localD1StateFileSystem,
  idFactory: () => string = randomUUID,
): Promise<LocalD1ResetResult> {
  const statePath = getCanonicalLocalD1StatePath(project, fileSystem);
  const wranglerDirectory = dirname(statePath);
  if (fileSystem.kind(wranglerDirectory) === "missing") fileSystem.mkdir(wranglerDirectory);
  if (fileSystem.kind(wranglerDirectory) !== "directory") {
    throw new Error(`Refusing local D1 reset: ${wranglerDirectory} changed during validation.`);
  }
  if (!equalPath(fileSystem.realpath(wranglerDirectory), wranglerDirectory)) {
    throw new Error(`Refusing local D1 reset: ${wranglerDirectory} changed to a non-project path.`);
  }

  const hadState = fileSystem.kind(statePath) === "directory";
  const backupPath = hadState
    ? makeResetArtifactPath(statePath, "backup", idFactory, fileSystem)
    : undefined;
  if (backupPath) fileSystem.rename(statePath, backupPath);

  try {
    fileSystem.mkdir(statePath);
    if (
      fileSystem.kind(statePath) !== "directory" ||
      !equalPath(fileSystem.realpath(statePath), statePath)
    ) {
      throw new Error(`Refusing local D1 reset: ${statePath} changed during reset.`);
    }
    await replayMigrations();
  } catch (replayError) {
    const recoveryErrors: string[] = [];
    let failedPath: string | undefined;
    try {
      if (fileSystem.kind(statePath) !== "missing") {
        if (backupPath) {
          failedPath = makeResetArtifactPath(statePath, "failed", idFactory, fileSystem);
          fileSystem.rename(statePath, failedPath);
        } else {
          fileSystem.removeTree(statePath);
        }
      }
    } catch (error) {
      recoveryErrors.push(`could not move aside failed replay state: ${String(error)}`);
    }

    if (backupPath) {
      try {
        if (fileSystem.kind(statePath) !== "missing") {
          throw new Error(`${statePath} is occupied; previous state remains at ${backupPath}`);
        }
        fileSystem.rename(backupPath, statePath);
      } catch (error) {
        recoveryErrors.push(
          `could not restore the previous state from ${backupPath}: ${String(error)}`,
        );
      }
    }

    if (failedPath && fileSystem.kind(failedPath) !== "missing") {
      try {
        fileSystem.removeTree(failedPath);
      } catch (error) {
        recoveryErrors.push(`failed replay files remain at ${failedPath}: ${String(error)}`);
      }
    }

    const recovery =
      recoveryErrors.length > 0
        ? ` Recovery needs attention: ${recoveryErrors.join("; ")}.`
        : backupPath
          ? ` Previous local state was restored at ${statePath}.`
          : ` No previous state existed; the failed reset state was removed.`;
    throw new Error(`D1 local migration replay failed: ${String(replayError)}.${recovery}`);
  }

  if (backupPath) {
    try {
      fileSystem.removeTree(backupPath);
    } catch {
      return { statePath, retainedBackup: backupPath };
    }
  }
  return { statePath };
}

/** Snapshot existing local state, execute seed statements, and rollback on failure. */
export async function seedLocalD1State(
  project: ProjectContext,
  executeSeed: () => Promise<void>,
  fileSystem: LocalD1StateFileSystem = localD1StateFileSystem,
  idFactory: () => string = randomUUID,
): Promise<LocalD1SeedResult> {
  const statePath = getCanonicalLocalD1StatePath(project, fileSystem);
  const wranglerDirectory = dirname(statePath);
  if (fileSystem.kind(wranglerDirectory) === "missing") fileSystem.mkdir(wranglerDirectory);
  if (fileSystem.kind(wranglerDirectory) !== "directory") {
    throw new Error(`Refusing local D1 seed: ${wranglerDirectory} must be a directory.`);
  }
  if (!equalPath(fileSystem.realpath(wranglerDirectory), wranglerDirectory)) {
    throw new Error(`Refusing local D1 seed: ${wranglerDirectory} changed to a non-project path.`);
  }

  const hadState = fileSystem.kind(statePath) === "directory";
  const backupPath = hadState
    ? makeResetArtifactPath(statePath, "backup", idFactory, fileSystem, "flare-seed")
    : undefined;

  if (backupPath) {
    fileSystem.copyTree(statePath, backupPath);
  }

  try {
    await executeSeed();
  } catch (seedError) {
    const recoveryErrors: string[] = [];
    if (backupPath) {
      try {
        if (fileSystem.kind(statePath) !== "missing") {
          fileSystem.removeTree(statePath);
        }
        fileSystem.rename(backupPath, statePath);
      } catch (error) {
        recoveryErrors.push(
          `could not restore previous local state from ${backupPath}: ${String(error)}`,
        );
      }
    } else if (fileSystem.kind(statePath) !== "missing") {
      try {
        fileSystem.removeTree(statePath);
      } catch (error) {
        recoveryErrors.push(`could not clean up failed seed state: ${String(error)}`);
      }
    }

    const recovery =
      recoveryErrors.length > 0
        ? ` Recovery needs attention: ${recoveryErrors.join("; ")}.`
        : backupPath
          ? ` Previous local state was restored at ${statePath}.`
          : ` No previous state existed; the failed seed state was removed.`;
    throw new Error(`D1 local seed failed: ${String(seedError)}.${recovery}`);
  }

  if (backupPath) {
    try {
      fileSystem.removeTree(backupPath);
    } catch {
      return { statePath, retainedBackup: backupPath };
    }
  }
  return { statePath };
}

/** Optional project-owned seed SQL; Wrangler executes it only against local development state. */
export function getLocalD1SeedFile(project: ProjectContext): string {
  const seedFile = join(project.root, "packages", "db", "seed.local.sql");
  if (!existsSync(seedFile)) {
    throw new Error(
      `No project-owned local D1 seed script was found at ${seedFile}. Add that SQL file with this project's seed statements; Flare never invents seed rows.`,
    );
  }
  const stats = lstatSync(seedFile);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`Refusing D1 seed: ${seedFile} must be a regular project-owned SQL file.`);
  }
  const canonicalRoot = realpathSync(project.root);
  const canonicalSeed = realpathSync(seedFile);
  const relativeSeed = relative(canonicalRoot, canonicalSeed);
  if (relativeSeed === ".." || relativeSeed.startsWith(`..${sep}`) || isAbsolute(relativeSeed)) {
    throw new Error(
      `Refusing D1 seed: ${seedFile} does not resolve to a file owned by this project.`,
    );
  }
  return seedFile;
}

export function parseD1List(source: string): D1DatabaseRecord[] {
  const parsed = parseJsonOutput(source, "wrangler d1 list --json");
  const records = collectObjects(parsed)
    .filter((item) => typeof item.name === "string")
    .map((item) => ({
      name: item.name as string,
      id:
        typeof item.uuid === "string"
          ? item.uuid
          : typeof item.database_id === "string"
            ? item.database_id
            : typeof item.id === "string"
              ? item.id
              : "",
    }))
    .filter((item) => item.id.length > 0);
  const byName = new Map<string, D1DatabaseRecord>();
  for (const record of records) {
    const prior = byName.get(record.name);
    if (prior && prior.id !== record.id) {
      throw new Error(`Cloudflare returned duplicate D1 resources named ${record.name}.`);
    }
    byName.set(record.name, record);
  }
  return [...byName.values()];
}

export function parseMigrationState(result: RunResult, label: string): MigrationState {
  if (result.status !== 0) throw commandError(result, label);
  const output = `${result.stdout}\n${result.stderr}`;
  if (/No migrations to apply!/i.test(output)) return { pending: [] };
  const header = output.match(/Migrations to be applied:\s*/i);
  if (!header || header.index === undefined) {
    throw new Error(`${label} did not report a recognized migration state; refusing to continue.`);
  }
  const pending = [
    ...output
      .slice(header.index + header[0].length)
      .matchAll(/\b([A-Za-z0-9][A-Za-z0-9_.-]*\.sql)\b/g),
  ]
    .map((match) => match[1])
    .filter((name): name is string => Boolean(name));
  if (pending.length === 0) {
    throw new Error(
      `${label} reported pending migrations but did not list their names; refusing to continue.`,
    );
  }
  return { pending: [...new Set(pending)] };
}

export function migrationArgs(
  project: ProjectContext,
  env: "local" | "preview" | "production",
  apply: boolean,
): string[] {
  const binding = getAppD1Bindings(project)[env === "local" ? "development" : env];
  const operation = apply ? "apply" : "list";
  const args = ["d1", "migrations", operation, binding.binding];
  if (env === "local") {
    args.push(
      "--env",
      "development",
      "--local",
      "--persist-to",
      getCanonicalLocalD1StatePath(project),
    );
  } else if (env === "preview") {
    args.push("--env", "preview", "--remote");
  } else {
    args.push("--remote");
  }
  return withConfig(project, args);
}

export function readMigrationState(
  project: ProjectContext,
  deps: CliDependencies,
  env: "local" | "preview" | "production",
): MigrationState {
  if (env === "production") ensureProductionEnvironment(project, deps);
  const result = runTool(
    deps,
    "wrangler",
    migrationArgs(project, env, false),
    workerDirectory(project),
  );
  return parseMigrationState(result, `D1 ${env} migration status`);
}

export function getMigrationsDirectory(project: ProjectContext): string {
  return project.config.database === "neon"
    ? join(project.root, "packages", "db", "src", "neon", "migrations")
    : join(project.root, "packages", "db", "migrations");
}

export function isDestructiveMigration(sql: string): boolean {
  return /\b(?:DROP\s+(?:TABLE|COLUMN|INDEX|SCHEMA|TYPE|VIEW)|ALTER\s+TABLE\s+[\s\S]*?\bRENAME\s+(?:COLUMN|TO))\b/i.test(
    sql,
  );
}

export function checkDestructivePendingMigrations(
  project: ProjectContext,
  pending: string[],
  allow: boolean,
): string[] {
  const migrationsDirectory = getMigrationsDirectory(project);
  const destructive: string[] = [];
  for (const name of pending) {
    const file = join(migrationsDirectory, name);
    if (!existsSync(file)) {
      throw new Error(
        `Remote reports pending migration ${name}, but that file is missing from ${migrationsDirectory}.`,
      );
    }
    if (isDestructiveMigration(readFileSync(file, "utf8"))) destructive.push(name);
  }
  if (destructive.length > 0 && !allow) {
    throw new Error(
      `Pending production migration(s) contain destructive SQL: ${destructive.join(", ")}. Review them and rerun with --allow-destructive.`,
    );
  }
  return destructive;
}

export async function applyD1Migrations(
  project: ProjectContext,
  deps: CliDependencies,
  environment: "local" | "preview" | "production",
  allowDestructive = false,
): Promise<void> {
  if (environment === "production") ensureProductionEnvironment(project, deps);
  const state = readMigrationState(project, deps, environment);
  if (state.pending.length === 0) {
    getOutput(deps).log(`D1 ${environment} database is current; no migrations to apply.`);
    return;
  }
  if (environment === "production") {
    const destructive = checkDestructivePendingMigrations(project, state.pending, allowDestructive);
    if (destructive.length > 0) {
      getOutput(deps).warn(
        `Acknowledged destructive production migration(s): ${destructive.join(", ")}.`,
      );
    }
  }
  const result = runTool(
    deps,
    "wrangler",
    migrationArgs(project, environment, true),
    workerDirectory(project),
  );
  printCommandOutput(getOutput(deps), result);
  assertCommandSucceeded(result, `Apply D1 ${environment} migrations`);
}

export function fetchD1Records(project: ProjectContext, deps: CliDependencies): D1DatabaseRecord[] {
  const result = runTool(
    deps,
    "wrangler",
    withConfig(project, ["d1", "list", "--json"]),
    workerDirectory(project),
  );
  if (result.status !== 0) throw commandError(result, "wrangler d1 list");
  return parseD1List(result.stdout);
}

export function ensureRemoteD1(
  project: ProjectContext,
  deps: CliDependencies,
  records: D1DatabaseRecord[],
  binding: D1Binding,
): D1DatabaseRecord {
  const found = records.find((record) => record.name === binding.databaseName);
  if (found) return found;
  const created = runTool(
    deps,
    "wrangler",
    withConfig(project, ["d1", "create", binding.databaseName]),
    workerDirectory(project),
    { env: { ...getEnv(deps), CI: "1" } },
  );
  if (created.status !== 0) {
    const refreshed = fetchD1Records(project, deps).find(
      (record) => record.name === binding.databaseName,
    );
    if (refreshed) return refreshed;
    throw commandError(created, `Create D1 database ${binding.databaseName}`);
  }
  const refreshed = fetchD1Records(project, deps).find(
    (record) => record.name === binding.databaseName,
  );
  if (!refreshed) {
    throw new Error(
      `Wrangler created ${binding.databaseName}, but a follow-up list did not return its ID.`,
    );
  }
  return refreshed;
}

export function getNeonDatabaseUrl(
  project: ProjectContext,
  deps: CliDependencies,
  env: "local" | "preview" | "production",
): string {
  const envVars = getEnv(deps);
  if (env === "production") {
    const url = envVars.MIGRATION_STATUS_DATABASE_URL || envVars.DATABASE_URL;
    if (url) return url;
    throw new Error(
      "Neon production migration operations require MIGRATION_STATUS_DATABASE_URL or DATABASE_URL in environment.",
    );
  }
  if (env === "preview") {
    if (envVars.DATABASE_URL) return envVars.DATABASE_URL;
    const previewVarsPaths = [
      join(project.root, "apps", "web", ".preview.vars"),
      join(project.root, "apps", "server", ".preview.vars"),
    ];
    for (const previewVarsPath of previewVarsPaths) {
      if (existsSync(previewVarsPath)) {
        const parsed = parseEnvText(readFileSync(previewVarsPath, "utf8"), previewVarsPath);
        const url = parsed.get("DATABASE_URL");
        if (url) return url;
      }
    }
    throw new Error(
      "Neon preview migration operations require DATABASE_URL in apps/web/.preview.vars or environment.",
    );
  }
  // local
  if (envVars.DATABASE_URL) return envVars.DATABASE_URL;
  const devVarsPaths = [
    join(project.root, "apps", "web", ".dev.vars"),
    join(project.root, "apps", "server", ".dev.vars"),
  ];
  for (const devVarsPath of devVarsPaths) {
    if (existsSync(devVarsPath)) {
      const parsed = parseEnvText(readFileSync(devVarsPath, "utf8"), devVarsPath);
      const url = parsed.get("DATABASE_URL");
      if (url) return url;
    }
  }
  throw new Error(
    "Neon local migration operations require DATABASE_URL in apps/web/.dev.vars or environment.",
  );
}

export function parseNeonMigrationState(result: RunResult, label: string): MigrationState {
  if (result.status !== 0) throw commandError(result, label);
  const stdout = result.stdout.trim();
  const match = stdout.match(/\{[\s\S]*"pending"[\s\S]*\}/);
  if (!match) {
    throw new Error(`${label} did not report a recognized migration state.`);
  }
  try {
    const parsed = JSON.parse(match[0]) as { pending?: string[] };
    if (!parsed || !Array.isArray(parsed.pending)) {
      throw new Error(`${label} did not report a valid pending array.`);
    }
    return { pending: parsed.pending };
  } catch {
    throw new Error(`${label} output could not be parsed: ${stdout}`);
  }
}

export function readNeonMigrationState(
  project: ProjectContext,
  deps: CliDependencies,
  env: "local" | "preview" | "production",
): MigrationState {
  if (env === "production") ensureProductionEnvironment(project, deps);
  const url = getNeonDatabaseUrl(project, deps, env);
  const result = runTool(
    deps,
    "bun",
    ["run", "./src/neon/status.ts"],
    join(project.root, "packages", "db"),
    { env: makeEnv(deps, { DATABASE_URL: url }) },
  );
  return parseNeonMigrationState(result, `Neon ${env} migration status`);
}

export async function applyNeonMigrations(
  project: ProjectContext,
  deps: CliDependencies,
  environment: "local" | "preview" | "production",
  allowDestructive = false,
): Promise<void> {
  if (environment === "production") ensureProductionEnvironment(project, deps);
  const state = readNeonMigrationState(project, deps, environment);
  if (state.pending.length === 0) {
    getOutput(deps).log(`Neon ${environment} database is current; no migrations to apply.`);
    return;
  }
  if (environment === "production") {
    const destructive = checkDestructivePendingMigrations(project, state.pending, allowDestructive);
    if (destructive.length > 0) {
      getOutput(deps).warn(
        `Acknowledged destructive production migration(s): ${destructive.join(", ")}.`,
      );
    }
  }
  const url = getNeonDatabaseUrl(project, deps, environment);
  const result = runTool(
    deps,
    "bun",
    ["run", "./src/neon/migrate.ts"],
    join(project.root, "packages", "db"),
    { env: makeEnv(deps, { DATABASE_URL: url }) },
  );
  printCommandOutput(getOutput(deps), result);
  assertCommandSucceeded(result, `Apply Neon ${environment} migrations`);
}

export async function commandDb(
  project: ProjectContext,
  deps: CliDependencies,
  subcommand: string | undefined,
  subargs: string[],
): Promise<number> {
  const output = getOutput(deps);
  expectOnlyFlags(subargs, [
    "--env",
    "--allow-destructive",
    "--provider",
    "--yes",
    "--seed",
    "--port",
    "--host",
    "--help",
    "-h",
  ]);
  const provider = getOption(subargs, "--provider") ?? project.config.database;
  if (provider !== project.config.database) {
    throw new Error(
      `Database provider must match flare.config.ts (${project.config.database.toUpperCase()}). No database operation was attempted.`,
    );
  }
  requireSupportedAppDatabase(project, `flare db ${subcommand ?? ""}`);

  if (subcommand === "studio") {
    const studioScript = join(project.root, "packages", "db", "src", "studio.ts");
    const result = runTool(deps, "bun", ["run", studioScript, ...subargs], project.root);
    printCommandOutput(output, result);
    assertCommandSucceeded(result, "flare db studio");
    return 0;
  }

  const environment = getOption(subargs, "--env") ?? "local";
  if (environment !== "local" && environment !== "preview" && environment !== "production") {
    throw new Error(
      `Unsupported database environment ${environment}. Choose local, preview, or production.`,
    );
  }

  if (project.config.database === "neon") {
    if (subcommand === "status") {
      const state = readNeonMigrationState(project, deps, environment);
      if (state.pending.length === 0) output.log(`Neon ${environment} database is current.`);
      else
        output.error(`Neon ${environment} has pending migration(s): ${state.pending.join(", ")}.`);
      return state.pending.length === 0 ? 0 : 1;
    }
    if (subcommand === "migrate") {
      const destructiveAllowed = hasOption(subargs, "--allow-destructive");
      await applyNeonMigrations(project, deps, environment, destructiveAllowed);
      return 0;
    }
    if (subcommand === "seed" || subcommand === "reset") {
      if (environment !== "local") {
        throw new Error(
          `Neon ${subcommand} is supported for local state only. Remote ${subcommand} is intentionally unavailable.`,
        );
      }
      if (subcommand === "reset") {
        throw new Error(
          "Neon reset is deferred until a safe transactional branch reset is configured. No tables were dropped.",
        );
      }
      throw new Error("Neon seed data is not defined by this project. No database was changed.");
    }
    throw new Error(
      "Usage: flare db <migrate|status|seed|reset|studio> [--env local|preview|production].",
    );
  }

  requireAppD1(project, `flare db ${subcommand ?? ""}`);
  if (subcommand === "status") {
    const state = readMigrationState(project, deps, environment);
    if (state.pending.length === 0) output.log(`D1 ${environment} database is current.`);
    else output.error(`D1 ${environment} has pending migration(s): ${state.pending.join(", ")}.`);
    return state.pending.length === 0 ? 0 : 1;
  }
  if (subcommand === "migrate") {
    const destructiveAllowed = hasOption(subargs, "--allow-destructive");
    await applyD1Migrations(project, deps, environment, destructiveAllowed);
    return 0;
  }
  if (subcommand === "seed" || subcommand === "reset") {
    if (environment !== "local") {
      throw new Error(
        `D1 ${subcommand} is supported for local state only. Remote ${subcommand} is intentionally unavailable.`,
      );
    }
    if (subcommand === "reset") {
      if (getOption(subargs, "--env") !== "local") {
        throw new Error(
          "D1 reset requires an explicit `--env local`; remote or implicit reset targets are refused before filesystem changes.",
        );
      }
      const shouldSeed = hasOption(subargs, "--seed");
      const seedFile = shouldSeed ? getLocalD1SeedFile(project) : undefined;
      const localBinding = getAppD1Bindings(project).development;
      const statePath = getCanonicalLocalD1StatePath(project);
      const skipConfirm = hasOption(subargs, "--yes");
      const confirm = deps.confirm ?? defaultConfirm;
      if (
        !skipConfirm &&
        !(await confirm(
          `Reset local D1 database ${localBinding.databaseName} by replacing only ${statePath} and replaying migrations? This deletes local rows.`,
        ))
      ) {
        output.log("Cancelled; no local D1 files were changed.");
        return 1;
      }
      const result = await resetLocalD1State(project, async () => {
        await applyD1Migrations(project, deps, "local");
        if (shouldSeed && seedFile) {
          const seed = runTool(
            deps,
            "wrangler",
            withConfig(project, [
              "d1",
              "execute",
              localBinding.binding,
              "--local",
              "--env",
              "development",
              "--persist-to",
              statePath,
              "--file",
              seedFile,
            ]),
            workerDirectory(project),
          );
          printCommandOutput(output, seed);
          assertCommandSucceeded(seed, `Seed local D1 from ${seedFile}`);
        }
      });
      output.log(`Reset local D1 database ${localBinding.databaseName} at ${result.statePath}.`);
      if (shouldSeed && seedFile) {
        output.log(`Seeded local D1 database ${localBinding.databaseName} from ${seedFile}.`);
      }
      if (result.retainedBackup) {
        output.warn(
          `Reset and migration replay succeeded, but the previous local state snapshot remains at ${result.retainedBackup}; remove it after review.`,
        );
      }
      return 0;
    }
    const seedFile = getLocalD1SeedFile(project);
    const localBinding = getAppD1Bindings(project).development;
    const statePath = getCanonicalLocalD1StatePath(project);
    const result = await seedLocalD1State(project, async () => {
      const seed = runTool(
        deps,
        "wrangler",
        withConfig(project, [
          "d1",
          "execute",
          localBinding.binding,
          "--local",
          "--env",
          "development",
          "--persist-to",
          statePath,
          "--file",
          seedFile,
        ]),
        workerDirectory(project),
      );
      printCommandOutput(output, seed);
      assertCommandSucceeded(seed, `Seed local D1 from ${seedFile}`);
    });
    output.log(`Seeded local D1 database ${localBinding.databaseName} from ${seedFile}.`);
    if (result.retainedBackup) {
      output.warn(
        `Seed succeeded, but the previous local state snapshot remains at ${result.retainedBackup}; remove it after review.`,
      );
    }
    return 0;
  }
  throw new Error(
    "Usage: flare db <migrate|status|seed|reset|studio> [--env local|preview|production].",
  );
}
