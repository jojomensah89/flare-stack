import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
      join(project.root, ".wrangler", "state"),
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
  expectOnlyFlags(subargs, ["--env", "--allow-destructive", "--provider"]);
  const provider = getOption(subargs, "--provider") ?? project.config.database;
  if (provider !== project.config.database) {
    throw new Error(
      `Database provider must match flare.config.ts (${project.config.database.toUpperCase()}). No database operation was attempted.`,
    );
  }
  requireSupportedAppDatabase(project, `flare db ${subcommand ?? ""}`);
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
      "Usage: flare db <migrate|status|seed|reset> [--env local|preview|production].",
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
      throw new Error(
        "D1 reset is deferred until it can preserve and restore the local state if migration replay fails. No files were deleted.",
      );
    }
    throw new Error("D1 seed data is not defined by this project. No database was changed.");
  }
  throw new Error("Usage: flare db <migrate|status|seed|reset> [--env local|preview|production].");
}
