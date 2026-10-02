import { strict as assert } from "node:assert";
import { lstat, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { makeProjectOptions, parseArguments } from "../src/args";
import { createProjectPlan } from "../src/plan";
import { createProject, type CommandRunner } from "../src/workflow";

const args = process.argv.slice(2);
const staticOnly = args.includes("--static");
const extensionOnly = args.includes("--extension-only");
const packageIndex = args.indexOf("--flare-package");
const flarePackagePath = packageIndex >= 0 ? args[packageIndex + 1] : undefined;
if (packageIndex >= 0 && !flarePackagePath) {
  throw new Error("--flare-package requires an absolute package tarball or directory path.");
}
if (!staticOnly && !flarePackagePath) {
  throw new Error(
    "Pass --flare-package with the local flare@0.14.1 tarball for full setup/check/build fixtures.",
  );
}

const fixtures = [
  { name: "app-no-db", preset: "app", database: "none", auth: "none" },
  { name: "app-d1", preset: "app", database: "d1", auth: "none" },
  { name: "app-d1-auth", preset: "app", database: "d1", auth: "better-auth" },
  { name: "app-neon", preset: "app", database: "neon", auth: "none" },
  { name: "app-neon-auth", preset: "app", database: "neon", auth: "better-auth" },
  { name: "fullstack-no-db", preset: "fullstack", database: "none", auth: "none" },
  { name: "fullstack-d1", preset: "fullstack", database: "d1", auth: "none" },
  { name: "fullstack-d1-auth", preset: "fullstack", database: "d1", auth: "better-auth" },
  { name: "fullstack-neon", preset: "fullstack", database: "neon", auth: "none" },
  { name: "fullstack-neon-auth", preset: "fullstack", database: "neon", auth: "better-auth" },
  { name: "worker-no-db", preset: "worker", database: "none", auth: "none" },
  { name: "worker-d1", preset: "worker", database: "d1", auth: "none" },
  { name: "worker-neon", preset: "worker", database: "neon", auth: "none" },
  { name: "extension-none", preset: "extension", database: "none", auth: "none" },
] as const;
assert.equal(
  fixtures.length,
  14,
  "The generated-project matrix must cover all 14 supported profiles.",
);
assert.equal(
  new Set(fixtures.map((fixture) => fixture.name)).size,
  fixtures.length,
  "Generated-project fixture names must be unique.",
);
const selectedFixtures = extensionOnly
  ? fixtures.filter((fixture) => fixture.preset === "extension")
  : fixtures;

const fakeNeonDatabaseUrl =
  "postgresql://fixture:fixture@127.0.0.1:55432/flare_fixture?sslmode=disable";
const commandSteps: Record<string, { kind: "bun" | "git"; args: string[] }> = {
  "dependency installation": { kind: "bun", args: ["install"] },
  "Git initialization": { kind: "git", args: ["init", "--initial-branch=main"] },
  "project setup": { kind: "bun", args: ["run", "setup"] },
  "rendered-source formatting": { kind: "bun", args: ["run", "format"] },
  "quality checks": { kind: "bun", args: ["check"] },
  "production build": { kind: "bun", args: ["run", "build"] },
};

function makeFixtureCommandRunner(fixture: (typeof fixtures)[number]): CommandRunner {
  return async (executable, commandArgs, cwd, label) => {
    const expected = commandSteps[label];
    assert.ok(expected, `Unexpected generated-project command: ${label}`);
    assert.deepEqual(commandArgs, expected.args, `Unexpected arguments for ${label}`);
    if (expected.kind === "git") {
      assert.equal(executable, "git", `Unexpected executable for ${label}`);
    } else {
      assert.match(basename(executable), /^bun(?:\.exe)?$/i, `Unexpected executable for ${label}`);
    }

    const fixtureEnv =
      fixture.database === "neon"
        ? { ...process.env, DATABASE_URL: fakeNeonDatabaseUrl }
        : process.env;

    if (label === "project setup" && fixture.database === "neon") {
      const appDirectory = fixture.preset === "worker" ? "apps/server" : "apps/web";
      await writeFile(
        join(cwd, appDirectory, ".dev.vars"),
        `# Disposable localhost-only acceptance fixture; never points to a provider.\nDATABASE_URL=${fakeNeonDatabaseUrl}\n`,
        { flag: "wx" },
      );
    }

    const child = Bun.spawn([executable, ...commandArgs], {
      cwd,
      env: fixtureEnv,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    const exitCode = await child.exited;
    if (exitCode !== 0) {
      throw new Error(`${label} exited with code ${exitCode} for ${fixture.name}.`);
    }
  };
}

const fixtureRoot = await mkdtemp(join(tmpdir(), "flare-create-fixtures-"));
const resolvedFixtureRoot = resolve(fixtureRoot);
if (
  dirname(resolvedFixtureRoot) !== resolve(tmpdir()) ||
  !basename(resolvedFixtureRoot).startsWith("flare-create-fixtures-") ||
  basename(resolvedFixtureRoot).length <= "flare-create-fixtures-".length
) {
  throw new Error(`Refusing to use an unexpected fixture directory: ${resolvedFixtureRoot}`);
}

const fixtureFailures: string[] = [];

try {
  for (const fixture of selectedFixtures) {
    try {
      const destination = join(fixtureRoot, fixture.name);
      const parsed = parseArguments([
        destination,
        "--preset",
        fixture.preset,
        "--db",
        fixture.database,
        `--auth=${fixture.auth}`,
        ...(flarePackagePath ? ["--flare-package", flarePackagePath] : []),
      ]);
      const options = makeProjectOptions(parsed);
      await createProject(createProjectPlan(options), {
        skipValidationCommands: staticOnly,
        commandRunner: makeFixtureCommandRunner(fixture),
      });
      const stat = await lstat(destination);
      assert.ok(stat.isDirectory(), `${basename(destination)} must exist at its final path`);
      console.log(
        `✓ ${fixture.name}: ${staticOnly ? "template validation" : "install, setup, check, and build"}`,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      fixtureFailures.push(`${fixture.name}: ${detail}`);
      console.error(`✗ ${fixture.name}: ${detail}`);
    }
  }
} finally {
  await rm(resolvedFixtureRoot, { recursive: true, force: true });
}

if (fixtureFailures.length > 0) {
  throw new Error(
    `${fixtureFailures.length} generated-project fixture(s) failed:\n${fixtureFailures.map((failure) => `- ${failure}`).join("\n")}`,
  );
}

console.log("All generated-project fixtures passed.");
