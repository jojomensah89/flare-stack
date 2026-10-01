import {
  clearCloudflareEnvironment,
  expectOnlyFlags,
  getEnv,
  getOption,
  getOutput,
  makeEnv,
  printCommandOutput,
  runTool,
  serverDirectory,
  webDirectory,
  withBuiltDeploymentConfig,
  type CliDependencies,
} from "./common";
import {
  applyNeonMigrations,
  migrationArgs,
  readMigrationState,
  readNeonMigrationState,
} from "./db";
import { previewUrls, verifyAppHealth } from "./health";
import { runtimeVars, validateRemoteHosts } from "./hosts";
import { requireValidSecretsForPreview, verifyPreviewSecretsAfterDeploy } from "./secrets";
import { getRequiredSecrets, requireSupportedAppDatabase, type ProjectContext } from "../project";
import { assertCommandSucceeded } from "../runner";

export async function commandPreview(
  project: ProjectContext,
  deps: CliDependencies,
  args: string[],
): Promise<number> {
  expectOnlyFlags(args, ["--name", "--tag", "--message", "--url"]);
  requireSupportedAppDatabase(project, "flare preview");
  if (getEnv(deps).CLOUDFLARE_ENV !== undefined) {
    throw new Error(
      "Preview requires CLOUDFLARE_ENV to be unset so the production config is not selected accidentally.",
    );
  }
  validateRemoteHosts(project);
  requireValidSecretsForPreview(project, deps, getOutput(deps));

  const output = getOutput(deps);
  if (project.config.database === "d1") {
    const previewState = readMigrationState(project, deps, "preview");
    if (previewState.pending.length > 0) {
      output.log(
        `Applying ${previewState.pending.length} isolated preview D1 migration(s): ${previewState.pending.join(", ")}.`,
      );
      const apply = runTool(
        deps,
        "wrangler",
        migrationArgs(project, "preview", true),
        webDirectory(project),
      );
      printCommandOutput(output, apply);
      assertCommandSucceeded(apply, "Apply preview D1 migrations");
    }
  } else if (project.config.database === "neon") {
    const previewState = readNeonMigrationState(project, deps, "preview");
    if (previewState.pending.length > 0) {
      output.log(
        `Applying ${previewState.pending.length} isolated preview Neon migration(s): ${previewState.pending.join(", ")}.`,
      );
      await applyNeonMigrations(project, deps, "preview", false);
    }
  }

  const build = runTool(deps, "bun", ["run", "build"], project.root, {
    env: makeEnv(deps, { CLOUDFLARE_ENV: undefined, FLARE_ENVIRONMENT: "preview" }),
  });
  printCommandOutput(output, build);
  assertCommandSucceeded(build, "Preview build");

  if (project.config.preset === "fullstack") {
    output.log("Deploying backend server Worker Preview (apps/server)...");
    const serverPreview = runTool(
      deps,
      "wrangler",
      ["versions", "upload", "--env", "preview"],
      serverDirectory(project),
      { env: clearCloudflareEnvironment(deps) },
    );
    printCommandOutput(output, serverPreview);
    assertCommandSucceeded(serverPreview, "Server Worker Preview deploy");
  }

  const previewFlags: string[] = ["preview", "--json"];
  for (const flag of ["--name", "--tag", "--message"]) {
    const value = getOption(args, flag);
    if (value) previewFlags.push(flag, value);
  }
  for (const [name, value] of Object.entries(runtimeVars(project, "worker-preview"))) {
    previewFlags.push("--var", `${name}:${value}`);
  }
  const result = runTool(
    deps,
    "wrangler",
    withBuiltDeploymentConfig(project, previewFlags),
    webDirectory(project),
    { env: clearCloudflareEnvironment(deps) },
  );
  if (result.stdout.trim()) output.log(result.stdout.trimEnd());
  if (result.stderr.trim()) output.error(result.stderr.trimEnd());
  assertCommandSucceeded(result, "Wrangler Worker Preview deploy");

  const deployment = previewUrls(result.stdout);
  if (getRequiredSecrets(project).length > 0) {
    if (!deployment.name) {
      throw new Error(
        "Wrangler created a Worker Preview but did not return its preview_name; required secrets cannot be verified safely.",
      );
    }
    verifyPreviewSecretsAfterDeploy(project, deps, output, deployment.name);
  }
  const publicUrl = getOption(args, "--url") ?? deployment.urls[0];
  if (!publicUrl) {
    output.error(
      "Preview deployment succeeded, but Wrangler returned no preview URL. Health checks remain unverified; pass --url <origin> or use `flare health <url>`.",
    );
    return 2;
  }
  const healthPath = project.config.preset === "fullstack" ? "/api/health" : "/health";
  try {
    await verifyAppHealth(publicUrl, deps.fetcher ?? fetch, 5, 1500, healthPath);
    output.log(`Preview health checks passed for ${publicUrl}: root and ${healthPath}.`);
  } catch (error) {
    output.error(
      `Preview deployment succeeded, but health verification failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 2;
  }
  return 0;
}
