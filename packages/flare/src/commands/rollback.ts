import {
  clearCloudflareEnvironment,
  ensureProductionEnvironment,
  expectOnlyFlags,
  getOption,
  getOutput,
  printCommandOutput,
  runTool,
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
  if (project.config.preset === "fullstack") {
    throw new Error(
      "Fullstack rollback is unavailable until Flare has recorded paired web/server releases and retention checks. No Worker was rolled back.",
    );
  }
  requireSupportedAppDatabase(project, "flare rollback");
  ensureProductionEnvironment(project, deps);
  const result = runTool(
    deps,
    "wrangler",
    withConfig(project, ["rollback"]),
    webDirectory(project),
    { env: clearCloudflareEnvironment(deps) },
  );
  printCommandOutput(getOutput(deps), result);
  assertCommandSucceeded(result, "Wrangler Worker rollback");
  const url = getOption(args, "--url") ?? deployedUrls(`${result.stdout}\n${result.stderr}`)[0];
  if (!url) {
    getOutput(deps).error(
      "Rollback command succeeded, but the public Worker URL was not returned; health remains unverified. Run `flare health <url>`.",
    );
    return 2;
  }
  try {
    await verifyAppHealth(url, deps.fetcher ?? fetch);
    getOutput(deps).log(`Rollback health checks passed for ${url}: root and /health.`);
  } catch (error) {
    getOutput(deps).error(
      `Rollback succeeded, but post-rollback health verification failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 2;
  }
  return 0;
}
