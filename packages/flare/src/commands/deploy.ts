import { randomUUID } from "node:crypto";
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
  serverDirectory,
  webDirectory,
  withBuiltDeploymentConfig,
  type CliDependencies,
} from "./common";
import { readMigrationState, readNeonMigrationState } from "./db";
import { deployedUrls, verifyAppHealth } from "./health";
import { validateRemoteHosts } from "./hosts";
import { missingSecretNames, remoteSecretNames, reportSecretNames } from "./secrets";
import {
  getRequiredSecrets,
  requireApp,
  requireSupportedAppDatabase,
  type ProjectContext,
} from "../project";
import { assertCommandSucceeded } from "../runner";

export async function commandDeploy(
  project: ProjectContext,
  deps: CliDependencies,
  args: string[],
): Promise<number> {
  expectOnlyFlags(args, ["--cloudflare-only", "--url"]);
  requireApp(project, "flare deploy");
  requireSupportedAppDatabase(project, "flare deploy");
  ensureProductionEnvironment(project, deps);
  validateRemoteHosts(project);

  const output = getOutput(deps);
  const cloudflareOnly = hasOption(args, "--cloudflare-only");
  const databaseState =
    project.config.database === "d1"
      ? readMigrationState(project, deps, "production")
      : project.config.database === "neon"
        ? readNeonMigrationState(project, deps, "production")
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

  const pairedReleaseTag =
    project.config.preset === "fullstack" ? `flare:${randomUUID()}` : undefined;
  if (pairedReleaseTag) {
    output.log(`Coordinated fullstack release tag: ${pairedReleaseTag}`);
  }

  if (project.config.preset === "worker") {
    output.log("Deploying Worker (apps/server)...");
    const result = runTool(deps, "wrangler", ["deploy"], serverDirectory(project), {
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
      await verifyAppHealth(url, deps.fetcher ?? fetch, 5, 1500, "/health");
      output.log(`Production health checks passed for ${url}: root and /health.`);
    } catch (error) {
      output.error(
        `Production deployment succeeded, but health verification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 2;
    }
    return 0;
  }

  if (project.config.preset === "fullstack") {
    if (!pairedReleaseTag) {
      throw new Error("Fullstack deploy is missing its coordinated release tag.");
    }
    output.log("Deploying backend server Worker (apps/server)...");
    const serverResult = runTool(
      deps,
      "wrangler",
      ["deploy", "--tag", pairedReleaseTag],
      serverDirectory(project),
      { env: clearCloudflareEnvironment(deps) },
    );
    printCommandOutput(output, serverResult);
    assertCommandSucceeded(serverResult, "Production Server Worker deploy");
  }

  output.log(
    project.config.preset === "fullstack"
      ? "Deploying frontend web Worker (apps/web)..."
      : "Deploying Worker (apps/web)...",
  );
  const argsForWrangler = withBuiltDeploymentConfig(
    project,
    pairedReleaseTag ? ["deploy", "--tag", pairedReleaseTag] : ["deploy"],
  );
  const result = runTool(deps, "wrangler", argsForWrangler, webDirectory(project), {
    env: clearCloudflareEnvironment(deps),
  });
  printCommandOutput(output, result);
  assertCommandSucceeded(
    result,
    project.config.preset === "fullstack"
      ? "Production Web Worker deploy"
      : "Production Worker deploy",
  );

  const requestedUrl = getOption(args, "--url");
  const url = requestedUrl ?? deployedUrls(`${result.stdout}\n${result.stderr}`)[0];
  if (!url) {
    output.error(
      "Worker deployment succeeded, but Wrangler did not report a workers.dev URL. Health checks remain unverified; rerun `flare health <url>` with the public Worker origin.",
    );
    return 2;
  }
  const healthPath = project.config.preset === "fullstack" ? "/api/health" : "/health";
  try {
    await verifyAppHealth(url, deps.fetcher ?? fetch, 5, 1500, healthPath);
    output.log(`Production health checks passed for ${url}: root and ${healthPath}.`);
  } catch (error) {
    output.error(
      `Worker deployment succeeded, but post-deploy health verification failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 2;
  }
  return 0;
}
