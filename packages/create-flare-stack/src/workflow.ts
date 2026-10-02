import { existsSync } from "node:fs";
import { lstat, mkdtemp, rename, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { materializeProject, validateMaterializedProject } from "./materialize";
import { GenerationError, type ProjectPlan } from "./model";
import { resolveTemplateRoot } from "./plan";
import { installSkills, type SkillFetcher } from "./skills";

export function resolveBunExecutable(execPath: string = process.execPath): string {
  if (/bunx(\.exe)?$/i.test(execPath)) {
    const candidate = execPath.replace(/bunx(\.exe)?$/i, (_m, ext) => `bun${ext ?? ""}`);
    if (existsSync(candidate)) {
      return candidate;
    }
    const whichBun = Bun.which("bun");
    if (whichBun) {
      return whichBun;
    }
  }
  return execPath;
}

export type CommandRunner = (
  executable: string,
  args: string[],
  cwd: string,
  label: string,
) => Promise<void>;

async function runCommand(
  executable: string,
  args: string[],
  cwd: string,
  label: string,
): Promise<void> {
  let child: ReturnType<typeof Bun.spawn>;
  try {
    child = Bun.spawn([executable, ...args], {
      cwd,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
  } catch (error) {
    throw new GenerationError(
      label,
      `Could not start ${executable} ${args.join(" ")}: ${String(error)}`,
      `Make sure ${executable} is installed and available, then retry the scaffold.`,
      { cause: error },
    );
  }
  const code = await child.exited;
  if (code !== 0) {
    throw new GenerationError(
      label,
      `\`${executable} ${args.join(" ")}\` exited with code ${code}.`,
      `Fix the reported ${label.toLowerCase()} error in a clean directory, then run the command again.`,
    );
  }
}

export interface CreateProjectDependencies {
  templateRoot?: string;
  commandRunner?: CommandRunner;
  skipValidationCommands?: boolean;
  skillFetcher?: SkillFetcher;
}

export async function createProject(
  plan: ProjectPlan,
  dependencies: CreateProjectDependencies = {},
): Promise<void> {
  if (!process.versions.bun) {
    throw new GenerationError(
      "runtime check",
      "The create-flare-stack CLI must run under Bun.",
      "Run it with `bunx --bun --package <release-archive-url> create-flare-stack <project-name>`.",
    );
  }

  const destination = plan.options.destination;
  const parent = dirname(destination);
  const templateRoot =
    dependencies.templateRoot ?? resolveTemplateRoot(import.meta.dir.replace(/[\\/]src$/, ""));
  const run = dependencies.commandRunner ?? runCommand;
  const stage = await mkdtemp(join(parent, `.${plan.options.projectName}.flare-`));
  let committedToDestination = false;

  try {
    console.log(`Creating ${plan.options.projectName} from the ${plan.options.preset} preset...`);
    await materializeProject(plan, stage, templateRoot);
    await ensureDestinationIsStillAvailable(destination);
    await rename(stage, destination);
    committedToDestination = true;

    if (plan.options.skills && plan.options.skills.length > 0) {
      console.log(`Downloading and installing agent skills (${plan.options.skills.join(", ")})...`);
      await installSkills(destination, plan.options.skills, dependencies.skillFetcher);
    }

    if (!dependencies.skipValidationCommands) {
      const bun = resolveBunExecutable();
      console.log("Installing project dependencies with Bun...");
      await run(bun, ["install"], destination, "dependency installation");

      console.log("Initializing Git and project-local setup...");
      await run("git", ["init", "--initial-branch=main"], destination, "Git initialization");
      await run(bun, ["run", "setup"], destination, "project setup");

      console.log("Formatting the rendered project with its pinned Oxfmt...");
      await run(bun, ["run", "format"], destination, "rendered-source formatting");

      console.log("Running bun check and production build...");
      await run(bun, ["check"], destination, "quality checks");
      await run(bun, ["run", "build"], destination, "production build");
    }

    await validateMaterializedProject(plan, destination);
  } catch (error) {
    let outputState: string;
    if (committedToDestination) {
      outputState = ` The incomplete project remains at ${destination} for inspection; it was not reported as created.`;
    } else if (isOwnedStage(stage, parent, plan.options.projectName)) {
      try {
        await rm(stage, { recursive: true, force: true });
        outputState = " The temporary project directory was removed.";
      } catch (cleanupError) {
        outputState = ` Cleanup could not remove the temporary directory at ${stage}: ${String(cleanupError)}`;
      }
    } else {
      outputState = ` The unrecognized temporary directory was retained at ${stage}.`;
    }
    if (error instanceof GenerationError) {
      throw new GenerationError(error.step, `${error.message}${outputState}`, error.remediation, {
        cause: error,
      });
    }
    throw new GenerationError(
      "project generation",
      `Project generation failed: ${String(error)}.${outputState}`,
      "Correct the reported filesystem or template issue and retry with a new destination.",
      { cause: error },
    );
  }
}

function isOwnedStage(stage: string, parent: string, projectName: string): boolean {
  const resolvedStage = resolve(stage);
  const resolvedParent = resolve(parent);
  const stageName = basename(resolvedStage);
  return (
    dirname(resolvedStage) === resolvedParent &&
    stageName.startsWith(`.${projectName}.flare-`) &&
    stageName.length > `.${projectName}.flare-`.length
  );
}

async function ensureDestinationIsStillAvailable(destination: string): Promise<void> {
  try {
    await lstat(destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new GenerationError(
    "destination validation",
    `Destination appeared during generation: ${destination}`,
    "Choose a new empty destination and rerun the generator.",
  );
}
