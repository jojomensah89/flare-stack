import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { initializeLocalSecrets, validateGitignore } from "./env";
import {
  findProjectRoot,
  getAppD1Bindings,
  getRequiredSecrets,
  loadProject,
  requireApp,
} from "./project";
import { runManagedCommand, type CommandRunner } from "./runner";

export interface LocalSetupOptions {
  startDirectory?: string;
  runner?: CommandRunner;
  output?: Pick<Console, "log" | "error" | "warn">;
}

/** Initialize local project state, optional secrets, Git hooks, and generated Worker types. */
export async function runLocalSetup(options: LocalSetupOptions = {}): Promise<void> {
  const output = options.output ?? console;
  const root = findProjectRoot(options.startDirectory ?? process.cwd());
  const project = await loadProject(root);

  if (project.config.preset === "extension") {
    const gitignoreProblems = validateGitignore(root);
    if (gitignoreProblems.length > 0) {
      throw new Error(`Local setup cannot proceed: ${gitignoreProblems.join(" ")}`);
    }
    output.log("Preparing the local extension workspace...");
    const runner = options.runner ?? runManagedCommand;
    if (existsSync(join(root, ".git"))) {
      const lefthook = runner("bun", ["x", "--no-install", "lefthook", "install"], { cwd: root });
      if (lefthook.status === 0) {
        output.log("Git hooks are installed.");
      } else {
        output.warn(
          "Git hooks were not installed. Run bun x lefthook install after dependencies are available.",
        );
      }
    } else {
      output.log("Git hooks were skipped because this directory has no .git entry.");
    }
    output.log("Setup complete. Run bun dev, bun check, bun run build, or bun package.");
    return;
  }

  requireApp(project, "bun setup");

  const gitignoreProblems = validateGitignore(root);
  if (gitignoreProblems.length > 0) {
    throw new Error(`Local secrets are not safe to create: ${gitignoreProblems.join(" ")}`);
  }

  output.log("Preparing the local app workspace...");
  const targetDirectory =
    project.config.preset === "worker" ? join(root, "apps", "server") : join(root, "apps", "web");
  const targetLabel = project.config.preset === "worker" ? "apps/server" : "apps/web";
  if (project.config.database === "d1") {
    getAppD1Bindings(project);
    const stateDirectory = join(root, ".wrangler", "state");
    mkdirSync(stateDirectory, { recursive: true });
    output.log(`Local D1 persistence is ready at ${stateDirectory}.`);
  } else if (project.config.database === "none") {
    output.log("No local database state directory is needed.");
  } else {
    output.log(
      `Neon local setup only prepares declared secret names; supply a non-production DATABASE_URL in ${targetLabel}/.dev.vars.`,
    );
  }

  const requiredSecrets = getRequiredSecrets(project);
  const localSecrets = initializeLocalSecrets(
    join(targetDirectory, ".dev.vars.example"),
    join(targetDirectory, ".dev.vars"),
    requiredSecrets,
  );
  if (localSecrets.generated.length > 0) {
    output.log(`Generated local secret(s): ${localSecrets.generated.join(", ")}.`);
  }
  if (localSecrets.extra.length > 0) {
    output.warn(
      `Preserved undeclared local secret name(s) in ${targetLabel}/.dev.vars: ${localSecrets.extra.join(", ")}. Their values were not read back or changed.`,
    );
  }
  if (localSecrets.missing.length > 0) {
    throw new Error(
      `Local setup needs values for ${localSecrets.missing.join(", ")} in ${targetLabel}/.dev.vars. Fill those values, then run bun setup again.`,
    );
  }
  if (requiredSecrets.length > 0) {
    output.log(
      `Local secret names are ready: ${requiredSecrets.join(", ")}; values were not displayed.`,
    );
  } else {
    output.log("No local secret values are required.");
  }

  const runner = options.runner ?? runManagedCommand;
  if (existsSync(join(root, ".git"))) {
    const lefthook = runner("bun", ["x", "--no-install", "lefthook", "install"], { cwd: root });
    if (lefthook.status === 0) {
      output.log("Git hooks are installed.");
    } else {
      output.warn(
        "Git hooks were not installed. Run bun x lefthook install after dependencies are available.",
      );
    }
  } else {
    output.log("Git hooks were skipped because this directory has no .git entry.");
  }

  const types = runner(
    "wrangler",
    ["types", "--include-runtime=false", "--config", project.wranglerPath],
    {
      cwd: targetDirectory,
    },
  );
  if (types.stdout.trim()) output.log(types.stdout.trimEnd());
  if (types.stderr.trim()) output.error(types.stderr.trimEnd());
  if (types.status !== 0) {
    throw new Error(
      "Wrangler binding types could not be generated. Check the error above, then rerun bun setup.",
    );
  }
  output.log("Cloudflare binding types are current.");
  output.log("Setup complete. Run bun dev, bun check, bun run build, bun preview, or bun deploy.");
}
