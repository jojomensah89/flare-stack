import { join } from "node:path";
import {
  atomicWrite,
  clearCloudflareEnvironment,
  defaultConfirm,
  ensureProductionEnvironment,
  expectOnlyFlags,
  getOutput,
  hasOption,
  printCommandOutput,
  runTool,
  webDirectory,
  withConfig,
  type CliDependencies,
  type D1DatabaseRecord,
} from "./common";
import { applyD1Migrations, ensureRemoteD1, fetchD1Records, readMigrationState } from "./db";
import { commandDeploy } from "./deploy";
import {
  callWhoAmI,
  parseHostList,
  patchRuntimeHosts,
  resolveHostInput,
  validateRemoteHosts,
  validateRuntimeVarParity,
} from "./hosts";
import {
  missingSecretNames,
  promptProductionSecrets,
  remoteSecretNames,
  runSecretBulk,
} from "./secrets";
import { initializeLocalSecrets, readSecretFile } from "../env";
import {
  getAppD1Bindings,
  getRequiredSecrets,
  getWorkerName,
  loadProject,
  patchD1ResourceIds,
  requireSupportedAppDatabase,
  type ProjectContext,
} from "../project";
import { assertCommandSucceeded } from "../runner";

export async function commandSetupCloudflare(
  project: ProjectContext,
  deps: CliDependencies,
  args: string[],
): Promise<number> {
  expectOnlyFlags(args, ["--public-host", "--preview-host"]);
  requireSupportedAppDatabase(project, "flare setup cloudflare");
  ensureProductionEnvironment(project, deps);
  const output = getOutput(deps);
  const authEnabled = project.config.auth === "better-auth";
  if (!authEnabled && (hasOption(args, "--public-host") || hasOption(args, "--preview-host"))) {
    throw new Error(
      "This project has authentication disabled and does not use AUTH_ALLOWED_HOSTS host inputs.",
    );
  }
  const workerName = getWorkerName(project);
  const productionHost = authEnabled
    ? await resolveHostInput(
        args,
        "--public-host",
        "Production AUTH_ALLOWED_HOSTS (exact hostnames, comma-separated): ",
        deps,
      )
    : undefined;
  const previewHost = authEnabled
    ? await resolveHostInput(
        args,
        "--preview-host",
        `Preview host pattern or hostname (include *-${workerName}.<your-workers.dev-subdomain>.workers.dev for Worker Previews; replace the placeholder): `,
        deps,
        true,
        workerName,
      )
    : undefined;

  validateRuntimeVarParity(project);
  if (productionHost && previewHost) {
    const productionHosts = parseHostList(productionHost, "production AUTH_ALLOWED_HOSTS");
    const previewHosts = parseHostList(previewHost, "preview AUTH_ALLOWED_HOSTS", {
      workerPreviewPattern: true,
      workerName,
    });
    if (productionHosts.some((host) => previewHosts.includes(host))) {
      throw new Error(
        "Production and Preview AUTH_ALLOWED_HOSTS must not contain the same exact hostname.",
      );
    }
  }

  callWhoAmI(project, deps);
  let production: D1DatabaseRecord | undefined;
  let preview: D1DatabaseRecord | undefined;
  let updatedConfig = project.wranglerSource;
  if (project.config.database === "d1") {
    const bindings = getAppD1Bindings(project);
    const existing = fetchD1Records(project, deps);
    production = ensureRemoteD1(project, deps, existing, bindings.production);
    const afterProduction = existing.some((record) => record.name === production?.name)
      ? existing
      : [...existing, production];
    preview = ensureRemoteD1(project, deps, afterProduction, bindings.preview);
    updatedConfig = patchD1ResourceIds(
      project.wranglerSource,
      project.wranglerNode,
      new Map([
        [production.name, production.id],
        [preview.name, preview.id],
      ]),
    );
  }
  const withHosts = patchRuntimeHosts(updatedConfig, project, productionHost, previewHost);
  atomicWrite(project.wranglerPath, `${withHosts.trimEnd()}\n`);
  project = await loadProject(project.root);
  validateRemoteHosts(project);
  const types = runTool(
    deps,
    "wrangler",
    withConfig(project, ["types", "--include-runtime=false"]),
    webDirectory(project),
    {
      env: clearCloudflareEnvironment(deps),
    },
  );
  printCommandOutput(output, types);
  assertCommandSucceeded(types, "Regenerate Cloudflare binding types after setup");
  if (production && preview) {
    output.log(
      `Provisioned D1 resources ${production.name} (${production.id}) and ${preview.name} (${preview.id}); updated ${project.wranglerPath}.`,
    );
  } else {
    output.log(
      `Updated app runtime configuration in ${project.wranglerPath}; this project has no database resources to provision.`,
    );
  }

  const required = getRequiredSecrets(project);
  if (required.length > 0) {
    const existingProductionSecrets = remoteSecretNames(project, deps, "production", true);
    const missingProductionSecrets = missingSecretNames(required, existingProductionSecrets);
    if (missingProductionSecrets.length > 0) {
      output.log(
        `Pushing production secret names to Worker ${workerName}: ${missingProductionSecrets.join(", ")}. Values will not be displayed.`,
      );
      const prodValues = await promptProductionSecrets(missingProductionSecrets, deps, output);
      const prodPush = runSecretBulk(project, deps, "production", prodValues);
      if (prodPush.status !== 0) {
        throw new Error(
          `D1 resources and Wrangler config are ready, but production secret push failed (exit ${prodPush.status}). Rerun flare secrets push --env production.`,
        );
      }
    } else {
      output.log(
        `Required production secret names already exist on Worker ${workerName}; existing values were not replaced.`,
      );
    }

    const previewFile = join(project.root, "apps", "web", ".preview.vars");
    const previewExample = join(project.root, "apps", "web", ".preview.vars.example");
    const previewSecrets = initializeLocalSecrets(previewExample, previewFile, required);
    if (previewSecrets.generated.length > 0) {
      output.log(`Generated preview secret name(s): ${previewSecrets.generated.join(", ")}.`);
    }
    if (previewSecrets.missing.length > 0) {
      throw new Error(
        `Production setup is ready; preview secret(s) still need values in ${previewFile}: ${previewSecrets.missing.join(", ")}.`,
      );
    }
    const values = readSecretFile(previewFile, required);
    output.log(
      `Pushing preview secret names to Worker Preview Base for ${workerName}: ${Object.keys(values.values).join(", ")}. Values will not be displayed.`,
    );
    const previewPush = runSecretBulk(project, deps, "preview", values.values);
    if (previewPush.status !== 0) {
      throw new Error(
        `Production secrets were pushed, but Preview Base secret push failed (exit ${previewPush.status}). Rerun flare secrets push --env preview.`,
      );
    }
    output.log(`Preview Base secret names pushed for Worker ${workerName}.`);
  }

  if (project.config.database === "d1" && production) {
    const migrationState = readMigrationState(project, deps, "production");
    if (migrationState.pending.length > 0) {
      output.log(
        `Production database ${production.name} has pending migration(s): ${migrationState.pending.join(", ")}.`,
      );
      const confirm = deps.confirm ?? defaultConfirm;
      if (await confirm(`Apply these production migrations to ${production.name}?`)) {
        await applyD1Migrations(project, deps, "production", false);
      } else {
        output.log("Skipped production migrations. Run bun db:migrate:prod after review.");
      }
    } else {
      output.log(`Production database ${production.name} is current.`);
    }
  }
  const confirmDeploy = deps.confirm ?? defaultConfirm;
  if (await confirmDeploy("Run the first production deploy now?")) {
    return await commandDeploy(project, deps, []);
  }
  output.log("Cloudflare setup is complete. Run `bun deploy` when you are ready.");
  return 0;
}
