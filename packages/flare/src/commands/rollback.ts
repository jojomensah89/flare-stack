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

export async function commandRollback(
  project: ProjectContext,
  deps: CliDependencies,
  args: string[],
): Promise<number> {
  expectOnlyFlags(args, ["--url"]);
  requireSupportedAppDatabase(project, "flare rollback");
  ensureProductionEnvironment(project, deps);
  const output = getOutput(deps);

  if (project.config.preset === "fullstack") {
    output.log("Rolling back backend server Worker (apps/server)...");
    const serverResult = runTool(deps, "wrangler", ["rollback"], serverDirectory(project), {
      env: clearCloudflareEnvironment(deps),
    });
    printCommandOutput(output, serverResult);
    assertCommandSucceeded(serverResult, "Server Worker rollback");
  }

  output.log(
    project.config.preset === "fullstack"
      ? "Rolling back frontend web Worker (apps/web)..."
      : "Rolling back Worker (apps/web)...",
  );
  const result = runTool(
    deps,
    "wrangler",
    withConfig(project, ["rollback"]),
    webDirectory(project),
    { env: clearCloudflareEnvironment(deps) },
  );
  printCommandOutput(output, result);
  assertCommandSucceeded(
    result,
    project.config.preset === "fullstack" ? "Web Worker rollback" : "Worker rollback",
  );

  const url = getOption(args, "--url") ?? deployedUrls(`${result.stdout}\n${result.stderr}`)[0];
  if (!url) {
    output.error(
      "Rollback command succeeded, but the public Worker URL was not returned; health remains unverified. Run `flare health <url>`.",
    );
    return 2;
  }
  const healthPath = project.config.preset === "fullstack" ? "/api/health" : "/health";
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
