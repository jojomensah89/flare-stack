import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { makeProjectOptions, parseArguments, validateRequestedChoices } from "./args";
import { FLARE_VERSION, GenerationError, UserInputError } from "./model";
import { createProjectPlan } from "./plan";
import { makeReleaseMetadata } from "./release";
import { createProject } from "./workflow";

const release = makeReleaseMetadata();
const HELP = `create-flare-stack ${FLARE_VERSION}

Usage:
  bunx --bun --package ${release.generatorReleaseUrl} create-flare-stack <directory> [options]

Supported in this release:
  --preset app|fullstack|worker|extension
  --db none|d1|neon
  --auth                 Enable Better Auth (requires --db d1 or --db neon)
  --auth=none|better-auth
  --flare-package <path-or-url>
                         Use a local Flare package archive/directory or archive URL

The extension preset supports only --db none and --auth none.
The worker preset does not support Better Auth.
`;

async function collectInteractiveChoices<
  T extends { preset?: string; database?: string; auth?: string },
>(choices: T): Promise<T> {
  if (!stdin.isTTY || !stdout.isTTY) return choices;
  const ask = createInterface({ input: stdin, output: stdout });
  try {
    if (!choices.preset) {
      choices.preset =
        (await ask.question("Preset (app/fullstack/worker/extension) [app]: "))
          .trim()
          .toLowerCase() || "app";
    }
    if (!choices.database) {
      choices.database =
        (await ask.question("Database (none/d1/neon) [none]: ")).trim().toLowerCase() || "none";
    }
    if (!choices.auth) {
      const answer = (await ask.question("Enable Better Auth? (y/N): ")).trim().toLowerCase();
      choices.auth = answer === "y" || answer === "yes" ? "better-auth" : "none";
    }
    return choices;
  } finally {
    ask.close();
  }
}

export async function runCli(args: string[]): Promise<number> {
  try {
    const parsed = parseArguments(args);
    if (parsed.help) {
      console.log(HELP);
      return 0;
    }
    validateRequestedChoices(parsed);
    const choices = await collectInteractiveChoices(parsed);
    const options = makeProjectOptions(choices);
    const plan = createProjectPlan(options);
    await createProject(plan);

    console.log(`\nCreated and validated ${options.projectName}.`);
    console.log(
      `Preset: ${options.preset} | Database: ${options.database} | Auth: ${options.auth}`,
    );
    console.log("\nNext steps:");
    console.log(`  cd ${options.projectName}`);
    console.log("  bun dev");
    if (options.preset === "extension") {
      console.log("  bun run check");
      console.log("  bun run build");
      console.log("  bun run package   # Chrome, Firefox, and Edge archives");
    } else {
      console.log("  bun preview");
      console.log("  bun deploy");
      console.log("  flare setup cloudflare   # first-time Cloudflare resources and secrets");
    }
    return 0;
  } catch (error) {
    if (error instanceof GenerationError) {
      console.error(`\nScaffold failed during ${error.step}: ${error.message}`);
      console.error(`Remediation: ${error.remediation}`);
      return 1;
    }
    if (error instanceof UserInputError) {
      console.error(error.message);
      console.error("Run with `--help` to see supported choices.");
      return 2;
    }
    console.error(`Scaffold failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
