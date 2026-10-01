import { strict as assert } from "node:assert";
import { lstat, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { makeProjectOptions, parseArguments } from "../src/args";
import { createProjectPlan } from "../src/plan";
import { createProject } from "../src/workflow";

const args = process.argv.slice(2);
const staticOnly = args.includes("--static");
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
] as const;
const fixtureRoot = await mkdtemp(join(tmpdir(), "flare-create-fixtures-"));
const resolvedFixtureRoot = resolve(fixtureRoot);
if (
  dirname(resolvedFixtureRoot) !== resolve(tmpdir()) ||
  !basename(resolvedFixtureRoot).startsWith("flare-create-fixtures-") ||
  basename(resolvedFixtureRoot).length <= "flare-create-fixtures-".length
) {
  throw new Error(`Refusing to use an unexpected fixture directory: ${resolvedFixtureRoot}`);
}

try {
  for (const fixture of fixtures) {
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
    await createProject(createProjectPlan(options), { skipValidationCommands: staticOnly });
    const stat = await lstat(destination);
    assert.ok(stat.isDirectory(), `${basename(destination)} must exist at its final path`);
    console.log(
      `✓ ${fixture.name}: ${staticOnly ? "template validation" : "setup, check, and build"}`,
    );
  }
} finally {
  await rm(resolvedFixtureRoot, { recursive: true, force: true });
}

console.log("All generated-project fixtures passed.");
