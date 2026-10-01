import { join } from "node:path";
import {
  ensureProductionEnvironment,
  expectOnlyFlags,
  getOutput,
  type CliDependencies,
} from "./common";
import { missingSecretNames, parseSecretEnvironment, remoteSecretNames } from "./secrets";
import { readSecretFile } from "../env";
import { getRequiredSecrets, requireSupportedAppDatabase, type ProjectContext } from "../project";

export async function commandEnvCheck(
  project: ProjectContext,
  deps: CliDependencies,
  args: string[],
): Promise<number> {
  expectOnlyFlags(args, ["--env"]);
  const environment = parseSecretEnvironment(args);
  requireSupportedAppDatabase(project, "flare env check");
  const output = getOutput(deps);
  const required = getRequiredSecrets(project);
  if (environment === "production") ensureProductionEnvironment(project, deps);
  const file = join(
    project.root,
    "apps",
    "web",
    environment === "local" ? ".dev.vars" : ".preview.vars",
  );
  if (environment !== "production") {
    const local = readSecretFile(file, required);
    if (local.missing.length > 0) {
      output.error(`Missing ${environment} secret(s): ${local.missing.join(", ")}.`);
      return 1;
    }
    if (local.extra.length > 0) {
      output.error(`Undeclared secret name(s) in ${file}: ${local.extra.join(", ")}.`);
      return 1;
    }
    output.log(`${environment} secret names are present; values were not displayed.`);
    return 0;
  }
  const remote = remoteSecretNames(project, deps, environment);
  const missing = missingSecretNames(required, remote);
  if (missing.length > 0) {
    output.error(
      `Production is missing required secret name(s): ${missing.join(", ")}. Run flare secrets push --env production.`,
    );
    return 1;
  }
  output.log("Production required secret names are present; values were not displayed.");
  return 0;
}
