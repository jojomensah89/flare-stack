import { join } from "node:path";
import {
  clearCloudflareEnvironment,
  ensureProductionEnvironment,
  expectOnlyFlags,
  getOption,
  getOutput,
  printCommandOutput,
  runTool,
  serverDirectory,
  webDirectory,
  withConfig,
  type CliDependencies,
} from "./common";
import { deployedUrls, verifyAppHealth } from "./health";
import { requireSupportedAppDatabase, type ProjectContext } from "../project";
import { assertCommandSucceeded } from "../runner";
import { resolvePairedRollbackRelease } from "./operations";

export async function commandRollback(
  project: ProjectContext,
  deps: CliDependencies,
  args: string[],
): Promise<number> {
  expectOnlyFlags(args, project.config.preset === "fullstack" ? ["--url", "--release"] : ["--url"]);
  requireSupportedAppDatabase(project, "flare rollback");
  ensureProductionEnvironment(project, deps);
  const output = getOutput(deps);

  if (project.config.preset === "fullstack") {
    const release = await resolvePairedRollbackRelease(project, deps, getOption(args, "--release"));
    output.log(
      `Rolling back paired release ${release.tag}: web ${release.web.id} first, then server ${release.server.id}. Database migrations and resources will not be changed.`,
    );
    const webResult = runTool(
      deps,
      "wrangler",
      withConfig(project, ["rollback", release.web.id, "--yes"]),
      webDirectory(project),
      { env: clearCloudflareEnvironment(deps) },
    );
    printCommandOutput(output, webResult);
    assertCommandSucceeded(webResult, "Web Worker paired rollback");

    const serverConfig = join(serverDirectory(project), "wrangler.jsonc");
    const serverResult = runTool(
      deps,
      "wrangler",
      ["rollback", release.server.id, "--yes", "--config", serverConfig],
      serverDirectory(project),
      { env: clearCloudflareEnvironment(deps) },
    );
    printCommandOutput(output, serverResult);
    if (serverResult.status !== 0) {
      output.error(
        `Web Worker was rolled back to ${release.web.id}, but server rollback to ${release.server.id} failed. The database was not changed; reconcile the Worker pair manually before serving traffic.`,
      );
      return 2;
    }

    const url =
      getOption(args, "--url") ?? deployedUrls(`${webResult.stdout}\n${webResult.stderr}`)[0];
    if (!url) {
      output.error(
        `Paired rollback ${release.tag} succeeded, but Wrangler did not report a public web URL; health remains unverified. Run flare health <url>.`,
      );
      return 2;
    }
    try {
      await verifyAppHealth(url, deps.fetcher ?? fetch, 5, 1500, "/api/health");
      output.log(`Paired rollback health checks passed for ${url}: root and /api/health.`);
    } catch (error) {
      output.error(
        `Paired rollback ${release.tag} succeeded, but post-rollback health verification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 2;
    }
    return 0;
  }

  if (project.config.preset === "worker") {
    output.log("Rolling back Worker (apps/server)...");
    const result = runTool(
      deps,
      "wrangler",
      withConfig(project, ["rollback"]),
      serverDirectory(project),
      { env: clearCloudflareEnvironment(deps) },
    );
    printCommandOutput(output, result);
    assertCommandSucceeded(result, "Worker rollback");

    const url = getOption(args, "--url") ?? deployedUrls(`${result.stdout}\n${result.stderr}`)[0];
    if (!url) {
      output.error(
        "Rollback command succeeded, but the public Worker URL was not returned; health remains unverified. Run `flare health <url>`.",
      );
      return 2;
    }
    try {
      await verifyAppHealth(url, deps.fetcher ?? fetch, 5, 1500, "/health");
      output.log(`Rollback health checks passed for ${url}: root and /health.`);
    } catch (error) {
      output.error(
        `Rollback succeeded, but post-rollback health verification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 2;
    }
    return 0;
  }

  output.log("Rolling back Worker (apps/web)...");
  const result = runTool(
    deps,
    "wrangler",
    withConfig(project, ["rollback"]),
    webDirectory(project),
    { env: clearCloudflareEnvironment(deps) },
  );
  printCommandOutput(output, result);
  assertCommandSucceeded(result, "Worker rollback");

  const url = getOption(args, "--url") ?? deployedUrls(`${result.stdout}\n${result.stderr}`)[0];
  if (!url) {
    output.error(
      "Rollback command succeeded, but the public Worker URL was not returned; health remains unverified. Run `flare health <url>`.",
    );
    return 2;
  }
  const healthPath = "/health";
  try {
    await verifyAppHealth(url, deps.fetcher ?? fetch, 5, 1500, healthPath);
    output.log(`Rollback health checks passed for ${url}: root and ${healthPath}.`);
  } catch (error) {
    output.error(
      `Rollback succeeded, but post-rollback health verification failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 2;
  }
  return 0;
}
