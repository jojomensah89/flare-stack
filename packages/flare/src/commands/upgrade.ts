import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { FLARE_VERSION } from "../config";
import type { ProjectContext } from "../project";
import { assertCommandSucceeded } from "../runner";
import {
  atomicWrite,
  defaultConfirm,
  expectOnlyFlags,
  getOption,
  getOutput,
  hasOption,
  printCommandOutput,
  runTool,
  type CliDependencies,
} from "./common";

export async function commandUpgrade(
  project: ProjectContext,
  deps: CliDependencies,
  args: string[],
): Promise<number> {
  expectOnlyFlags(args, ["--dry-run", "--replace", "--yes", "--env", "--target-version"]);

  if (hasOption(args, "--env")) {
    const environment = getOption(args, "--env");
    if (environment !== "local") {
      throw new Error("flare upgrade only operates on local project files; --env must be 'local'.");
    }
  }

  const output = getOutput(deps);
  const targetVersion = getOption(args, "--target-version") ?? FLARE_VERSION;
  const currentVersion = project.config.flareVersion;
  const dryRun = hasOption(args, "--dry-run");
  const force = hasOption(args, "--replace");
  const skipConfirm = force || hasOption(args, "--yes") || hasOption(args, "--env");

  if (currentVersion === targetVersion && !force) {
    output.log(`Project is already on Flare Stack v${targetVersion}. Nothing to upgrade.`);
    return 0;
  }

  if (dryRun) {
    output.log(`[dry-run] Would upgrade Flare Stack from v${currentVersion} to v${targetVersion}:`);
    output.log(`  - Update flareVersion in flare.config.ts to "${targetVersion}"`);
    output.log(`  - Update flare dependency in package.json to target v${targetVersion}`);
    output.log("  - Create safety backup of modified files under .flare/upgrade-backup-<id>");
    output.log("  - Run bun install && bun setup");
    return 0;
  }

  if (!skipConfirm) {
    const confirm = deps.confirm ?? defaultConfirm;
    const ok = await confirm(`Upgrade Flare Stack from v${currentVersion} to v${targetVersion}?`);
    if (!ok) {
      output.log("Upgrade cancelled.");
      return 0;
    }
  }

  const configPath = join(project.root, "flare.config.ts");
  if (!existsSync(configPath)) {
    throw new Error(`Missing flare.config.ts at ${configPath}.`);
  }
  const configSource = readFileSync(configPath, "utf8");

  const packageJsonPath = join(project.root, "package.json");
  const hasPackageJson = existsSync(packageJsonPath);

  // Safety backup before any modification
  const backupId = randomUUID();
  const backupDir = join(project.root, ".flare", `upgrade-backup-${backupId}`);
  mkdirSync(backupDir, { recursive: true });
  copyFileSync(configPath, join(backupDir, "flare.config.ts"));
  if (hasPackageJson) {
    copyFileSync(packageJsonPath, join(backupDir, "package.json"));
  }
  output.log(`Created pre-upgrade backup at .flare/upgrade-backup-${backupId}`);

  // Patch flare.config.ts
  const updatedConfigSource = configSource.replace(
    /(["']?flareVersion["']?\s*:\s*)["'][^"']+["']/,
    `$1"${targetVersion}"`,
  );
  if (
    configSource === updatedConfigSource &&
    !configSource.includes(`flareVersion: "${targetVersion}"`)
  ) {
    throw new Error(`Could not locate flareVersion property to update in ${configPath}.`);
  }
  atomicWrite(configPath, updatedConfigSource);

  // Patch package.json if present
  if (hasPackageJson) {
    const packageJsonSource = readFileSync(packageJsonPath, "utf8");
    let packageJson: Record<string, unknown>;
    try {
      packageJson = JSON.parse(packageJsonSource) as Record<string, unknown>;
    } catch {
      throw new Error(`Root package.json at ${packageJsonPath} is not valid JSON.`);
    }

    const archiveUrl = `https://github.com/jojomensah89/flare-stack/releases/download/v${targetVersion}/flare-${targetVersion}.tgz`;
    let modified = false;

    for (const field of ["devDependencies", "dependencies"] as const) {
      const depsRecord = packageJson[field];
      if (depsRecord && typeof depsRecord === "object" && !Array.isArray(depsRecord)) {
        const record = depsRecord as Record<string, unknown>;
        if (typeof record.flare === "string") {
          const currentFlareDep = record.flare;
          if (currentFlareDep.startsWith("http://") || currentFlareDep.startsWith("https://")) {
            record.flare = archiveUrl;
            modified = true;
          } else if (
            !currentFlareDep.startsWith("file:") &&
            !currentFlareDep.startsWith("workspace:")
          ) {
            record.flare = targetVersion;
            modified = true;
          }
        }
      }
    }

    if (modified) {
      atomicWrite(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
    }
  }

  // Run bun install to update dependencies
  const installResult = runTool(deps, "bun", ["install"], project.root);
  printCommandOutput(output, installResult);
  assertCommandSucceeded(installResult, "bun install");

  // Run bun setup to regenerate bindings and workspace
  const setupScript = join(project.root, "scripts", "setup.ts");
  const setupArgs = existsSync(setupScript) ? ["run", setupScript] : ["run", "setup"];
  const setupResult = runTool(deps, "bun", setupArgs, project.root);
  printCommandOutput(output, setupResult);
  assertCommandSucceeded(setupResult, "bun setup");

  output.log(`Successfully upgraded project to Flare Stack v${targetVersion}.`);
  output.log("Manual review recommendations:");
  output.log("  - Review release notes at https://github.com/jojomensah89/flare-stack/releases");
  output.log("  - Run `bun check` to verify workspace types and formatting");
  output.log("  - Run `bun verify` to test the full production build pipeline");

  return 0;
}
