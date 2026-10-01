import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  getOutput,
  printCommandOutput,
  runTool,
  webDirectory,
  withConfig,
  type CliDependencies,
} from "./commands/common";
import { commandDb } from "./commands/db";
import { commandDeploy } from "./commands/deploy";
import { commandDoctor } from "./commands/doctor";
import { commandEnvCheck } from "./commands/env";
import { commandHealth } from "./commands/health";
import { commandPreview } from "./commands/preview";
import { commandRollback } from "./commands/rollback";
import { commandSecrets } from "./commands/secrets";
import { commandSetupCloudflare } from "./commands/setup";
import { findProjectRoot, loadProject } from "./project";
import { commandError } from "./runner";

export type { CliDependencies } from "./commands/common";

async function runCliInternal(argv: string[], deps: CliDependencies): Promise<number> {
  const output = getOutput(deps);
  const cwd = deps.cwd ?? process.cwd();
  const command = argv[0];
  const args = argv.slice(1);

  if (!command || command === "--help" || command === "-h" || command === "help") {
    output.log(
      "Flare Lifecycle CLI v0.14.1\nCommands: setup [cloudflare], preview, deploy, doctor, env check, secrets <list|push|generate>, db <status|migrate|seed|reset>, logs, rollback, health <url>\nRemote commands target the app preset with no database or D1. Run local `bun setup` first. Cloudflare setup requires explicit production and Preview hosts when authentication is enabled.",
    );
    return 0;
  }

  if (command === "health" || command === "health-check") return commandHealth(args, deps);
  if (command === "branch-preview-guard" || command === "cloudflare:branch-preview-guard") {
    output.log("Fullstack branch Previews are disabled; no Worker upload was attempted.");
    return 0;
  }

  const root = findProjectRoot(cwd);
  if (command === "setup" && args[0] !== "cloudflare") {
    const script = join(root, "scripts", "setup.ts");
    if (!existsSync(script)) throw new Error(`Missing local setup script: ${script}`);
    const result = runTool(deps, "bun", ["run", script], root);
    printCommandOutput(output, result);
    if (result.status !== 0) throw commandError(result, "bun setup");
    return 0;
  }

  const project = await loadProject(root);
  switch (command) {
    case "setup":
      if (args[0] !== "cloudflare") throw new Error("Usage: flare setup cloudflare.");
      return commandSetupCloudflare(project, deps, args.slice(1));
    case "preview":
      return commandPreview(project, deps, args);
    case "deploy":
      return commandDeploy(project, deps, args);
    case "doctor":
      return commandDoctor(project, deps, args);
    case "env":
      if (args[0] !== "check") {
        throw new Error("Usage: flare env check [--env local|preview|production].");
      }
      return commandEnvCheck(project, deps, args.slice(1));
    case "secrets":
      return commandSecrets(project, deps, args[0], args.slice(1));
    case "db":
      return commandDb(project, deps, args[0], args.slice(1));
    case "logs":
    case "tail": {
      const result = runTool(
        deps,
        "wrangler",
        withConfig(project, ["tail", ...args]),
        webDirectory(project),
      );
      printCommandOutput(output, result);
      return result.status ?? 1;
    }
    case "rollback":
      return commandRollback(project, deps, args);
    case "deployments":
    case "resources":
    case "upgrade":
      throw new Error(
        `flare ${command} is not implemented in this release; it will not report fabricated success.`,
      );
    default:
      output.log(
        "Flare Lifecycle CLI v0.14.1\nCommands: setup, preview, deploy, doctor, env, secrets, db, logs, rollback, health",
      );
      return command ? 2 : 0;
  }
}

export async function runCli(argv: string[], dependencies: CliDependencies = {}): Promise<number> {
  try {
    return await runCliInternal(argv, dependencies);
  } catch (error) {
    getOutput(dependencies).error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
