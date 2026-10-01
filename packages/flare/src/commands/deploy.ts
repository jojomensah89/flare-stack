import {
  clearCloudflareEnvironment,
  ensureProductionEnvironment,
  expectOnlyFlags,
  getOption,
  getOutput,
  hasOption,
  printCommandOutput,
  runCheckAndBuild,
  runTool,
  webDirectory,
  withBuiltDeploymentConfig,
  type CliDependencies,
} from "./common";
import { readMigrationState } from "./db";
import { deployedUrls, verifyAppHealth } from "./health";
import { validateRemoteHosts } from "./hosts";
import { missingSecretNames, remoteSecretNames, reportSecretNames } from "./secrets";
import { getRequiredSecrets, requireSupportedAppDatabase, type ProjectContext } from "../project";
import { assertCommandSucceeded } from "../runner";

export async function commandDeploy(
  project: ProjectContext,
  deps: CliDependencies,
  args: string[],
): Promise<number> {
  expectOnlyFlags(args, ["--cloudflare-only", "--url"]);
  requireSupportedAppDatabase(project, "flare deploy");
  ensureProductionEnvironment(project, deps);
  validateRemoteHosts(project);

  const output = getOutput(deps);
  const cloudflareOnly = hasOption(args, "--cloudflare-only");
  const databaseState =
    project.config.database === "d1"
      ? readMigrationState(project, deps, "production")
      : { pending: [] };
  if (databaseState.pending.length > 0) {
    throw new Error(
      `Production database has pending migration(s): ${databaseState.pending.join(", ")}. Run bun db:migrate:prod, then retry deploy.`,
    );
  }

  const required = getRequiredSecrets(project);
  if (required.length > 0) {
    const present = remoteSecretNames(project, deps, "production");
    reportSecretNames(output, "Production", present);
    const missing = missingSecretNames(required, present);
    if (missing.length > 0) {
      throw new Error(
        `Production is missing required secret name(s): ${missing.join(", ")}. Run flare secrets push --env production before deploying.`,
      );
    }
  }

  await runCheckAndBuild(project, deps, cloudflareOnly, "production");
  const argsForWrangler = withBuiltDeploymentConfig(project, ["deploy"]);
  const result = runTool(deps, "wrangler", argsForWrangler, webDirectory(project), {
    env: clearCloudflareEnvironment(deps),
  });
  printCommandOutput(output, result);
  assertCommandSucceeded(result, "Production Worker deploy");

  const requestedUrl = getOption(args, "--url");
  const url = requestedUrl ?? deployedUrls(`${result.stdout}\n${result.stderr}`)[0];
  if (!url) {
    output.error(
      "Worker deployment succeeded, but Wrangler did not report a workers.dev URL. Health checks remain unverified; rerun `flare health <url>` with the public Worker origin.",
    );
    return 2;
  }
  try {
    await verifyAppHealth(url, deps.fetcher ?? fetch);
    output.log(`Production health checks passed for ${url}: root and /health.`);
  } catch (error) {
    output.error(
      `Worker deployment succeeded, but post-deploy health verification failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 2;
  }
  return 0;
}
