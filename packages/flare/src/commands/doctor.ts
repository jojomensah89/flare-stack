import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  clearCloudflareEnvironment,
  ensureProductionEnvironment,
  expectOnlyFlags,
  getOutput,
  hasOption,
  runTool,
  workerDirectory,
  withConfig,
  type CliDependencies,
} from "./common";
import { readMigrationState, readNeonMigrationState } from "./db";
import { callWhoAmI, validateRemoteHosts } from "./hosts";
import { missingSecretNames, remoteSecretNames } from "./secrets";
import { readSecretFile, validateGitignore } from "../env";
import { getAppD1Bindings, getRequiredSecrets, type ProjectContext } from "../project";

export async function commandDoctor(
  project: ProjectContext,
  deps: CliDependencies,
  args: string[],
): Promise<number> {
  expectOnlyFlags(args, ["--remote"]);
  const output = getOutput(deps);
  const problems: string[] = [];
  const check = (name: string, ok: boolean, fix?: string) => {
    output[ok ? "log" : "error"](`${ok ? "✓" : "✗"} ${name}${!ok && fix ? ` — ${fix}` : ""}`);
    if (!ok) problems.push(name);
  };

  check("Bun runtime", Boolean(process.versions.bun), "Run Flare commands with Bun.");
  check(
    "Git repository",
    existsSync(join(project.root, ".git")),
    "Initialize Git if this is a new project.",
  );
  check(
    "Flare config",
    project.config.schemaVersion === 1,
    "Regenerate or repair flare.config.ts.",
  );
  check(
    "Wrangler config parses",
    Boolean(project.wrangler.name),
    "Repair apps/web/wrangler.jsonc.",
  );
  check(
    "Local secret files ignored",
    validateGitignore(project.root).length === 0,
    "Ignore .dev.vars and .preview.vars.",
  );
  check(
    "Production hosts are resolved",
    (() => {
      try {
        validateRemoteHosts(project);
        return true;
      } catch {
        return false;
      }
    })(),
    "Run flare setup cloudflare with exact production and preview hosts.",
  );

  const isSupportedPreset =
    project.config.preset === "app" || project.config.preset === "fullstack";
  if (isSupportedPreset && project.config.database === "d1") {
    try {
      getAppD1Bindings(project);
      check("D1 development, production, and preview bindings are isolated", true);
    } catch (error) {
      check(
        "D1 development, production, and preview bindings are isolated",
        false,
        error instanceof Error ? error.message : String(error),
      );
    }
  } else if (isSupportedPreset && project.config.database === "none") {
    check(
      "App without a database is supported",
      project.config.auth === "none",
      "Better Auth requires a database profile.",
    );
  } else if (isSupportedPreset && project.config.database === "neon") {
    check("Neon database configuration", true);
  } else {
    check(
      "App lifecycle supported",
      false,
      "This CLI release currently supports the app and fullstack presets only.",
    );
  }

  const required = getRequiredSecrets(project);
  if (required.length > 0) {
    const local = readSecretFile(join(project.root, "apps", "web", ".dev.vars"), required);
    check(
      "Required local secret names and values",
      local.missing.length === 0,
      `Run bun setup; missing: ${local.missing.join(", ")}.`,
    );
    if (local.extra.length > 0) {
      check(
        "No undeclared local secret keys",
        false,
        `Remove or declare: ${local.extra.join(", ")}.`,
      );
    }
  }

  const typesResult = runTool(
    deps,
    "wrangler",
    withConfig(project, ["types", "--check", "--include-runtime=false"]),
    workerDirectory(project),
    { env: clearCloudflareEnvironment(deps) },
  );
  check(
    "Generated development binding types are current",
    typesResult.status === 0,
    "Run bun setup to regenerate Wrangler types.",
  );

  if (hasOption(args, "--remote")) {
    try {
      ensureProductionEnvironment(project, deps);
      callWhoAmI(project, deps);
      check("Cloudflare authentication", true);
      if (project.config.database === "d1") {
        const production = readMigrationState(project, deps, "production");
        check(
          "Production migration state",
          production.pending.length === 0,
          `Run bun db:migrate:prod; pending: ${production.pending.join(", ")}.`,
        );
      } else if (project.config.database === "neon") {
        const production = readNeonMigrationState(project, deps, "production");
        check(
          "Production migration state",
          production.pending.length === 0,
          `Run bun db:migrate:prod; pending: ${production.pending.join(", ")}.`,
        );
      }
      const present = required.length > 0 ? remoteSecretNames(project, deps, "production") : [];
      const missing = missingSecretNames(required, present);
      check(
        "Required production secret names",
        missing.length === 0,
        `Run flare secrets push --env production; missing: ${missing.join(", ")}.`,
      );
    } catch (error) {
      check(
        "Cloudflare remote readiness",
        false,
        error instanceof Error ? error.message : String(error),
      );
    }
  } else {
    output.log(
      "Remote readiness was not queried. Use `flare doctor --remote` to check Cloudflare auth, production secrets, and D1 migration state.",
    );
  }

  output.log(
    problems.length === 0
      ? "Doctor completed with no local blockers."
      : `Doctor found ${problems.length} issue(s).`,
  );
  return problems.length === 0 ? 0 : 1;
}
