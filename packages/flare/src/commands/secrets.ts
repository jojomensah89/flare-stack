import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import {
  collectObjects,
  defaultPromptSecret,
  ensureProductionEnvironment,
  expectOnlyFlags,
  getOption,
  getOutput,
  hasOption,
  parseJsonOutput,
  printCommandOutput,
  runTool,
  webDirectory,
  withConfig,
  type CliDependencies,
  type Output,
} from "./common";
import {
  generateSecret,
  readSecretFile,
  serializeSecretValues,
  writeGeneratedSecret,
} from "../env";
import {
  getRequiredSecrets,
  getWorkerName,
  requireSupportedAppDatabase,
  type ProjectContext,
} from "../project";
import { assertCommandSucceeded, commandError, type RunResult } from "../runner";

export function parseSecretNames(source: string, label: string): string[] {
  const parsed = parseJsonOutput(source, label);
  const records = collectObjects(parsed);
  return [
    ...new Set(
      records.flatMap((record) =>
        typeof record.name === "string" && /^[A-Z][A-Z0-9_]*$/.test(record.name)
          ? [record.name]
          : [],
      ),
    ),
  ].sort();
}

export function parseSecretEnvironment(args: string[]): "local" | "preview" | "production" {
  const environment = getOption(args, "--env") ?? "production";
  if (environment !== "local" && environment !== "preview" && environment !== "production") {
    throw new Error(
      `Unsupported secret environment ${environment}. Choose local, preview, or production.`,
    );
  }
  return environment;
}

export async function promptProductionSecrets(
  names: string[],
  deps: CliDependencies,
  output: Output,
): Promise<Record<string, string>> {
  const values: Record<string, string> = {};
  for (const name of names) {
    const value =
      name === "BETTER_AUTH_SECRET"
        ? generateSecret()
        : await (deps.promptSecret ?? defaultPromptSecret)(name);
    if (!value.trim()) throw new Error(`Secret ${name} must not be empty.`);
    values[name] = value;
    output.log(`${name}: value collected in memory.`);
  }
  return values;
}

export function runSecretBulk(
  project: ProjectContext,
  deps: CliDependencies,
  environment: "production" | "preview",
  values: Record<string, string>,
  previewName?: string,
): RunResult {
  const workerName = getWorkerName(project);
  const args =
    environment === "production"
      ? withConfig(project, ["secret", "bulk", "--name", workerName])
      : withConfig(project, [
          "preview",
          "base-config",
          "secret",
          "bulk",
          "--worker-name",
          workerName,
          ...(previewName ? ["--name", previewName] : []),
        ]);
  return runTool(deps, "wrangler", args, webDirectory(project), {
    input: serializeSecretValues(values),
  });
}

export function remoteSecretNames(
  project: ProjectContext,
  deps: CliDependencies,
  environment: "production" | "preview",
  allowNewWorker = false,
): string[] {
  const workerName = getWorkerName(project);
  const args =
    environment === "production"
      ? withConfig(project, ["secret", "list", "--format", "json", "--name", workerName])
      : withConfig(project, [
          "preview",
          "base-config",
          "secret",
          "list",
          "--json",
          "--worker-name",
          workerName,
        ]);
  const result = runTool(deps, "wrangler", args, webDirectory(project));
  if (result.status !== 0) {
    // Wrangler converts API 10007 to this specific UserError, omitting the code.
    // Only first setup may bootstrap a missing Worker; all other errors fail closed.
    const diagnostic = stripVTControlCharacters(`${result.stdout}\n${result.stderr}`).replaceAll(
      "\r\n",
      "\n",
    );
    const isMissingWorker =
      diagnostic.includes(`Worker "${workerName}" not found`) ||
      diagnostic.includes(`Worker '${workerName}' not found`);
    if (allowNewWorker && environment === "production" && isMissingWorker) {
      return [];
    }
    throw commandError(result, `List ${environment} secrets`);
  }
  return parseSecretNames(result.stdout, `Wrangler ${environment} secret list`);
}

export function previewSecretNames(
  project: ProjectContext,
  deps: CliDependencies,
  previewName: string,
): string[] {
  const result = runTool(
    deps,
    "wrangler",
    withConfig(project, [
      "preview",
      "secret",
      "list",
      "--name",
      previewName,
      "--worker-name",
      getWorkerName(project),
      "--json",
    ]),
    webDirectory(project),
  );
  if (result.status !== 0) {
    throw commandError(result, `List secrets on Worker Preview ${previewName}`);
  }
  return parseSecretNames(result.stdout, `Wrangler Preview ${previewName} secret list`);
}

export function runPreviewSecretBulk(
  project: ProjectContext,
  deps: CliDependencies,
  previewName: string,
  values: Record<string, string>,
): RunResult {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "flare-preview-secrets-"));
  const temporaryFile = join(temporaryDirectory, "secrets.json");
  try {
    writeFileSync(temporaryFile, serializeSecretValues(values), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    return runTool(
      deps,
      "wrangler",
      withConfig(project, [
        "preview",
        "secret",
        "bulk",
        temporaryFile,
        "--name",
        previewName,
        "--worker-name",
        getWorkerName(project),
      ]),
      webDirectory(project),
    );
  } finally {
    try {
      unlinkSync(temporaryFile);
    } catch {
      // The file may not have been created if the initial write failed.
    }
    try {
      rmdirSync(temporaryDirectory);
    } catch {
      // Preserve the original command error if the operating system prevents cleanup.
    }
  }
}

export function missingSecretNames(required: string[], present: string[]): string[] {
  const names = new Set(present);
  return required.filter((name) => !names.has(name));
}

export function reportSecretNames(output: Output, environment: string, names: string[]): void {
  output.log(`${environment} configured secret names: ${names.length ? names.join(", ") : "none"}`);
}

export function requireValidSecretsForPreview(
  project: ProjectContext,
  deps: CliDependencies,
  output: Output,
): void {
  const required = getRequiredSecrets(project);
  if (required.length === 0) return;
  const present = remoteSecretNames(project, deps, "preview");
  reportSecretNames(output, "Worker Preview base config", present);
  const missing = missingSecretNames(required, present);
  if (missing.length > 0) {
    throw new Error(
      `Preview is missing required secret name(s): ${missing.join(", ")}. Run flare secrets push --env preview first.`,
    );
  }
}

export function verifyPreviewSecretsAfterDeploy(
  project: ProjectContext,
  deps: CliDependencies,
  output: Output,
  previewName: string,
): void {
  const required = getRequiredSecrets(project);
  if (required.length === 0) return;

  const current = previewSecretNames(project, deps, previewName);
  const missing = missingSecretNames(required, current);
  if (missing.length > 0) {
    const file = join(project.root, "apps", "web", ".preview.vars");
    const local = readSecretFile(file, required);
    if (local.extra.length > 0) {
      throw new Error(`${file} contains undeclared secret name(s): ${local.extra.join(", ")}.`);
    }
    if (local.missing.length > 0) {
      throw new Error(
        `Preview ${previewName} is missing ${missing.join(", ")}; ${file} also lacks values for ${local.missing.join(", ")}.`,
      );
    }
    const values = Object.fromEntries(missing.map((name) => [name, local.values[name] ?? ""]));
    output.log(
      `Preview ${previewName} is missing required secret name(s): ${missing.join(", ")}. Applying those names to this Preview once.`,
    );
    const repair = runPreviewSecretBulk(project, deps, previewName, values);
    printCommandOutput(output, repair);
    assertCommandSucceeded(repair, `Repair secrets on Worker Preview ${previewName}`);
  }

  const verified = previewSecretNames(project, deps, previewName);
  const stillMissing = missingSecretNames(required, verified);
  if (stillMissing.length > 0) {
    throw new Error(
      `Worker Preview ${previewName} still lacks required secret name(s) after one repair attempt: ${stillMissing.join(", ")}.`,
    );
  }
  reportSecretNames(output, `Worker Preview ${previewName}`, verified);
}

export async function commandSecrets(
  project: ProjectContext,
  deps: CliDependencies,
  subcommand: string | undefined,
  args: string[],
): Promise<number> {
  const output = getOutput(deps);
  const environment = parseSecretEnvironment(args);
  requireSupportedAppDatabase(project, `flare secrets ${subcommand ?? ""}`);
  const required = getRequiredSecrets(project);
  const workerName = getWorkerName(project);

  if (subcommand === "list") {
    expectOnlyFlags(args, ["--env"]);
    if (environment === "local") {
      const file = join(project.root, "apps", "web", ".dev.vars");
      const local = readSecretFile(file, required);
      reportSecretNames(output, "Local", [
        ...required.filter((name) => !local.missing.includes(name)),
        ...local.extra,
      ]);
      return local.missing.length === 0 && local.extra.length === 0 ? 0 : 1;
    }
    if (environment === "production") ensureProductionEnvironment(project, deps);
    const names = remoteSecretNames(project, deps, environment);
    reportSecretNames(output, environment, names);
    const missing = missingSecretNames(required, names);
    if (missing.length > 0) {
      output.error(`Missing required ${environment} secret name(s): ${missing.join(", ")}.`);
    }
    return missing.length === 0 ? 0 : 1;
  }

  if (subcommand === "push") {
    expectOnlyFlags(args, ["--env", "--replace"]);
    if (environment === "local") {
      throw new Error(
        "Local secrets are stored in apps/web/.dev.vars; use `bun setup` to initialize them.",
      );
    }
    if (environment === "production") ensureProductionEnvironment(project, deps);
    if (required.length === 0) {
      output.log(`No required ${environment} secrets are declared.`);
      return 0;
    }
    let values: Record<string, string>;
    if (environment === "preview") {
      const file = join(project.root, "apps", "web", ".preview.vars");
      const parsed = readSecretFile(file, required);
      if (parsed.extra.length > 0) {
        throw new Error(`${file} contains undeclared secret name(s): ${parsed.extra.join(", ")}.`);
      }
      if (parsed.missing.length > 0) {
        throw new Error(
          `Missing ${parsed.missing.join(", ")} in ${file}. Run flare secrets generate <NAME> --env preview first.`,
        );
      }
      values = parsed.values;
      output.log(
        `Pushing preview secret names to Worker Preview Base for ${workerName}: ${Object.keys(values).join(", ")}. Values will not be displayed.`,
      );
    } else {
      const present = remoteSecretNames(project, deps, "production");
      const names = hasOption(args, "--replace") ? required : missingSecretNames(required, present);
      if (names.length === 0) {
        output.log(
          `All required production secret names already exist on Worker ${workerName}; no values were changed.`,
        );
        return 0;
      }
      output.log(
        `Pushing production secret names to Worker ${workerName}: ${names.join(", ")}. Values will not be displayed.`,
      );
      values = await promptProductionSecrets(names, deps, output);
    }
    const result = runSecretBulk(project, deps, environment, values);
    if (result.status !== 0) {
      throw new Error(
        `Failed to update ${environment} secrets; Wrangler exit ${result.status}. Secret values were not printed.`,
      );
    }
    output.log(
      `Updated ${environment} secret names: ${Object.keys(values).join(", ")}. Values were streamed from memory.`,
    );
    return 0;
  }

  if (subcommand === "generate") {
    const [name] = expectOnlyFlags(args, ["--env"], 1);
    if (!name || !/^[A-Z][A-Z0-9_]*$/.test(name)) {
      throw new Error("Usage: flare secrets generate <NAME> --env <local|preview|production>.");
    }
    if (!required.includes(name)) {
      throw new Error(`${name} is not declared in wrangler.jsonc secrets.required.`);
    }
    if (name !== "BETTER_AUTH_SECRET") {
      throw new Error(
        `Flare can generate BETTER_AUTH_SECRET only. Supply ${name} through its provider.`,
      );
    }
    const value = generateSecret();
    if (environment === "production") {
      ensureProductionEnvironment(project, deps);
      output.log(
        `Generating and replacing ${name} on production Worker ${workerName}; the value will not be written to disk.`,
      );
      const result = runSecretBulk(project, deps, "production", { [name]: value });
      if (result.status !== 0) {
        throw new Error(
          `Failed to push generated ${name}; Wrangler exit ${result.status}. The value was not written to disk.`,
        );
      }
      output.log(
        `Generated and pushed ${name} to production Worker ${workerName}; the value was not written to disk.`,
      );
    } else {
      const file = join(
        project.root,
        "apps",
        "web",
        environment === "local" ? ".dev.vars" : ".preview.vars",
      );
      writeGeneratedSecret(file, name, value);
      output.log(`Generated ${name} in ${file}.`);
    }
    return 0;
  }

  throw new Error(
    "Usage: flare secrets <list|push|generate> [NAME] --env <local|preview|production>.",
  );
}
