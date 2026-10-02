import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FLARE_VERSION } from "../config";
import type { ProjectContext } from "../project";
import { assertCommandSucceeded } from "../runner";
import {
  atomicWrite,
  expectOnlyFlags,
  getOutput,
  hasOption,
  printCommandOutput,
  runTool,
  type CliDependencies,
} from "./common";

export interface RecipeRegistryEntry {
  name: string;
  description: string;
  supportedPresets: string[];
  capabilities: string[];
}

export interface RecipeRegistry {
  version: string;
  recipes: RecipeRegistryEntry[];
}

export interface RecipeManifest {
  name: string;
  description: string;
  supportedPresets?: string[];
  capabilities?: string[];
  layers?: string[];
}

export function findRecipesDirectory(customDir?: string): string {
  if (customDir && existsSync(customDir)) return customDir;
  if (process.env.FLARE_RECIPES_DIR && existsSync(process.env.FLARE_RECIPES_DIR)) {
    return process.env.FLARE_RECIPES_DIR;
  }
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // Monorepo relative path to create-flare-stack templates
    resolve(thisDir, "..", "..", "..", "create-flare-stack", "templates", FLARE_VERSION, "recipes"),
    // In case bundled in flare package
    resolve(thisDir, "..", "..", "templates", FLARE_VERSION, "recipes"),
    // In node_modules
    resolve(
      process.cwd(),
      "node_modules",
      "create-flare-stack",
      "templates",
      FLARE_VERSION,
      "recipes",
    ),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0]!;
}

function collectFiles(
  dir: string,
  baseDir = dir,
): Array<{ sourcePath: string; relativePath: string }> {
  const result: Array<{ sourcePath: string; relativePath: string }> = [];
  if (!existsSync(dir)) return result;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      result.push({
        sourcePath: fullPath,
        relativePath: relative(baseDir, fullPath).replace(/\\/g, "/"),
      });
    }
  }
  return result;
}

export async function commandRecipes(deps: CliDependencies, args: string[]): Promise<number> {
  const positionals = expectOnlyFlags(args, [], 1);
  const subcommand = positionals[0] ?? "list";
  if (subcommand !== "list") {
    throw new Error(
      `Unsupported subcommand "flare recipes ${subcommand}". Usage: flare recipes [list].`,
    );
  }

  const output = getOutput(deps);
  const recipesDir = findRecipesDirectory();
  const registryFile = join(recipesDir, "registry.json");
  if (!existsSync(registryFile)) {
    throw new Error(`Could not find recipe registry at ${registryFile}.`);
  }

  let registry: RecipeRegistry;
  try {
    registry = JSON.parse(readFileSync(registryFile, "utf8")) as RecipeRegistry;
  } catch {
    throw new Error(`Failed to parse recipe registry at ${registryFile}.`);
  }

  output.log(`Available Flare Stack Recipes (v${registry.version}):\n`);
  for (const recipe of registry.recipes) {
    const presets = recipe.supportedPresets.join(", ");
    output.log(`  ${recipe.name.padEnd(12)} - ${recipe.description}`);
    output.log(`  ${"".padEnd(12)}   (supported presets: ${presets})\n`);
  }
  output.log("Run `flare add <recipe>` to apply a recipe to your project.");
  return 0;
}

export async function commandAddRecipe(
  project: ProjectContext,
  deps: CliDependencies,
  args: string[],
): Promise<number> {
  const positionals = expectOnlyFlags(args, ["--dry-run", "--replace"], 1);
  const recipeName = positionals[0];
  if (!recipeName) {
    throw new Error(
      "Usage: flare add <recipe> [--replace] [--dry-run]. Run `flare recipes list` to see available recipes.",
    );
  }

  const output = getOutput(deps);
  const dryRun = hasOption(args, "--dry-run");
  const force = hasOption(args, "--replace");

  const recipesDir = findRecipesDirectory();
  const registryFile = join(recipesDir, "registry.json");
  if (!existsSync(registryFile)) {
    throw new Error(`Could not find recipe registry at ${registryFile}.`);
  }

  let registry: RecipeRegistry;
  try {
    registry = JSON.parse(readFileSync(registryFile, "utf8")) as RecipeRegistry;
  } catch {
    throw new Error(`Failed to parse recipe registry at ${registryFile}.`);
  }

  const entry = registry.recipes.find((r) => r.name === recipeName);
  if (!entry) {
    throw new Error(
      `Unknown recipe "${recipeName}". Run \`flare recipes list\` to see available recipes.`,
    );
  }

  const manifestPath = join(recipesDir, recipeName, "recipe.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Recipe manifest missing at ${manifestPath}.`);
  }

  let manifest: RecipeManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as RecipeManifest;
  } catch {
    throw new Error(`Invalid recipe manifest at ${manifestPath}.`);
  }

  // Validate preset compatibility
  if (manifest.supportedPresets && !manifest.supportedPresets.includes(project.config.preset)) {
    throw new Error(
      `Recipe "${recipeName}" is not supported for preset "${project.config.preset}". Supported presets: ${manifest.supportedPresets.join(", ")}.`,
    );
  }

  const capability = manifest.capabilities?.[0] ?? recipeName;
  const alreadyInstalled = project.config.capabilities.includes(capability);
  // Collect overlay files from layers
  const layers = manifest.layers ?? ["common"];
  const filesToApply: Array<{ sourcePath: string; relativePath: string; content: string }> = [];

  for (const layer of layers) {
    const layerDir = join(recipesDir, recipeName, layer);
    const files = collectFiles(layerDir);
    for (const f of files) {
      filesToApply.push({
        sourcePath: f.sourcePath,
        relativePath: f.relativePath,
        content: readFileSync(f.sourcePath, "utf8"),
      });
    }
  }

  // Check for conflict with existing files
  const conflicts: string[] = [];
  for (const f of filesToApply) {
    const destPath = join(project.root, f.relativePath);
    if (existsSync(destPath)) {
      const existing = readFileSync(destPath, "utf8");
      if (existing !== f.content) {
        conflicts.push(f.relativePath);
      }
    }
  }

  if (conflicts.length > 0 && !force && !dryRun) {
    throw new Error(
      `Cannot apply recipe "${recipeName}": file(s) already exist and differ:\n  ${conflicts.join(
        "\n  ",
      )}\nPass --replace to overwrite existing files.`,
    );
  }

  if (alreadyInstalled && !force && !dryRun) {
    output.log(
      `Recipe "${recipeName}" is already applied to this project (capability: "${capability}"). Pass --replace to re-apply.`,
    );
    return 0;
  }

  if (dryRun) {
    output.log(`[dry-run] Would apply recipe "${recipeName}":`);
    output.log(`  - Add capability "${capability}" to flare.config.ts`);
    for (const f of filesToApply) {
      const destPath = join(project.root, f.relativePath);
      const exists = existsSync(destPath);
      output.log(`  - ${exists ? "Overwrite" : "Create"} ${f.relativePath}`);
    }
    output.log("  - Run bun install && bun setup");
    return 0;
  }

  // Apply overlay files
  for (const f of filesToApply) {
    const destPath = join(project.root, f.relativePath);
    mkdirSync(dirname(destPath), { recursive: true });
    atomicWrite(destPath, f.content);
  }

  // Update capabilities in flare.config.ts if not present
  if (!alreadyInstalled) {
    const configPath = join(project.root, "flare.config.ts");
    const configSource = readFileSync(configPath, "utf8");
    const newCapabilities = [...project.config.capabilities, capability];
    const capabilitiesRegex = /(["']?capabilities["']?\s*:\s*)\[[^\]]*\]/;
    if (capabilitiesRegex.test(configSource)) {
      const formattedCaps = JSON.stringify(newCapabilities);
      const updatedConfig = configSource.replace(capabilitiesRegex, `$1${formattedCaps}`);
      atomicWrite(configPath, updatedConfig);
    } else {
      output.warn(
        `Could not auto-add "${capability}" to capabilities in flare.config.ts. Please add it manually.`,
      );
    }
  }

  // Run bun install and bun setup
  const installResult = runTool(deps, "bun", ["install"], project.root);
  printCommandOutput(output, installResult);
  assertCommandSucceeded(installResult, "bun install");

  const setupScript = join(project.root, "scripts", "setup.ts");
  const setupArgs = existsSync(setupScript) ? ["run", setupScript] : ["run", "setup"];
  const setupResult = runTool(deps, "bun", setupArgs, project.root);
  printCommandOutput(output, setupResult);
  assertCommandSucceeded(setupResult, "bun setup");

  output.log(`Successfully applied recipe "${recipeName}"!`);
  output.log(`Capability enabled: "${capability}"`);
  output.log("Next steps:");
  output.log(
    `  - Add the corresponding binding to apps/web/wrangler.jsonc or apps/server/wrangler.jsonc`,
  );
  output.log("  - Run `bun check` to verify types and formatting");

  return 0;
}
