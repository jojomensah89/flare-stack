import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { makeProjectOptions, parseArguments } from "../src/args";
import { FLARE_VERSION, UserInputError } from "../src/model";
import { createProjectPlan } from "../src/plan";
import { resolveBunExecutable } from "../src/workflow";

assert.equal(resolveBunExecutable("/path/to/bun"), "/path/to/bun");
assert.equal(resolveBunExecutable("C:\\bin\\bun.exe"), "C:\\bin\\bun.exe");
const testBunx = process.execPath.replace(/bun(\.exe)?$/i, (_m, ext) => `bunx${ext ?? ""}`);
assert.equal(resolveBunExecutable(testBunx), process.execPath);

let counter = 0;
function projectOptions(args: string[]) {
  const parsed = parseArguments([`flare-plan-fixture-${process.pid}-${counter++}`, ...args]);
  return makeProjectOptions(parsed);
}

function projectOptionsNamed(name: string) {
  return makeProjectOptions(parseArguments([name]));
}

function rejects(action: () => unknown, pattern: RegExp): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof UserInputError);
    assert.match(error.message, pattern);
    return true;
  });
}

const app = createProjectPlan(projectOptions([]));
assert.deepEqual(app.templateLayers, ["base", "app"]);

const appD1 = createProjectPlan(projectOptions(["--db", "d1"]));
assert.deepEqual(appD1.templateLayers, ["base", "app", "db/d1"]);

const appD1Auth = createProjectPlan(projectOptions(["--db", "d1", "--auth"]));
assert.deepEqual(appD1Auth.templateLayers, ["base", "app", "db/d1", "auth/better-auth"]);
assert.ok(appD1Auth.validationSteps.includes("run bun check"));
assert.ok(appD1Auth.validationSteps.includes("run bun run build"));

assert.equal(app.releaseMetadata?.flareArchiveName, "flare-0.14.1.tgz");
assert.equal(app.releaseMetadata?.generatorArchiveName, "create-flare-stack-0.14.1.tgz");

const urlOptions = projectOptions([
  "--flare-package",
  "https://github.com/example/flare-stack/releases/download/v0.14.1/flare-0.14.1.tgz",
]);
assert.equal(
  urlOptions.flarePackagePath,
  "https://github.com/example/flare-stack/releases/download/v0.14.1/flare-0.14.1.tgz",
);

const fullstack = createProjectPlan(projectOptions(["--preset", "fullstack"]));
assert.deepEqual(fullstack.templateLayers, ["base", "app", "fullstack/common"]);

const fullstackD1 = createProjectPlan(projectOptions(["--preset", "fullstack", "--db", "d1"]));
assert.deepEqual(fullstackD1.templateLayers, [
  "base",
  "app",
  "fullstack/common",
  "db/d1",
  "fullstack/db-d1",
]);

const fullstackD1Auth = createProjectPlan(
  projectOptions(["--preset", "fullstack", "--db", "d1", "--auth"]),
);
assert.deepEqual(fullstackD1Auth.templateLayers, [
  "base",
  "app",
  "fullstack/common",
  "db/d1",
  "fullstack/db-d1",
  "auth/better-auth",
  "fullstack/auth-better-auth",
]);

const appNeon = createProjectPlan(projectOptions(["--db", "neon"]));
assert.deepEqual(appNeon.templateLayers, ["base", "app", "db/neon"]);

const appNeonAuth = createProjectPlan(projectOptions(["--db", "neon", "--auth"]));
assert.deepEqual(appNeonAuth.templateLayers, [
  "base",
  "app",
  "db/neon",
  "auth/better-auth",
  "auth/better-auth-neon",
]);

const fullstackNeon = createProjectPlan(projectOptions(["--preset", "fullstack", "--db", "neon"]));
assert.deepEqual(fullstackNeon.templateLayers, [
  "base",
  "app",
  "fullstack/common",
  "db/neon",
  "fullstack/db-neon",
]);

const fullstackNeonAuth = createProjectPlan(
  projectOptions(["--preset", "fullstack", "--db", "neon", "--auth"]),
);
assert.deepEqual(fullstackNeonAuth.templateLayers, [
  "base",
  "app",
  "fullstack/common",
  "db/neon",
  "fullstack/db-neon",
  "auth/better-auth",
  "fullstack/auth-better-auth",
  "auth/better-auth-neon",
  "fullstack/auth-better-auth-neon",
]);

const worker = createProjectPlan(projectOptions(["--preset", "worker"]));
assert.deepEqual(worker.templateLayers, ["base", "worker/common"]);

const workerD1 = createProjectPlan(projectOptions(["--preset", "worker", "--db", "d1"]));
assert.deepEqual(workerD1.templateLayers, ["base", "worker/common", "db/d1", "worker/db-d1"]);

const workerNeon = createProjectPlan(projectOptions(["--preset", "worker", "--db", "neon"]));
assert.deepEqual(workerNeon.templateLayers, ["base", "worker/common", "db/neon", "worker/db-neon"]);

rejects(
  () => projectOptions(["--preset", "worker", "--auth"]),
  /does not support Better Auth session cookies/i,
);
rejects(() => projectOptions(["--preset", "unknown"]), /not available.*app, fullstack, worker/i);
rejects(() => projectOptions(["--auth"]), /requires a database/i);
rejects(() => projectOptions(["--db", "postgres"]), /Choose none, d1, or neon/i);
rejects(() => projectOptions(["--auth=false"]), /Choose none or better-auth/i);
rejects(() => projectOptions(["--flare-package", "relative/path.tgz"]), /absolute path/i);
rejects(
  () => projectOptions(["--flare-package", "https://example.com/archive.zip"]),
  /must point to a \.tgz archive/i,
);
rejects(() => projectOptionsNamed("flare.plan"), /lowercase letters, numbers, and hyphens/i);
rejects(() => projectOptionsNamed("a".repeat(59)), /1 and 58 characters/i);

const fixtureRoot = mkdtempSync(join(tmpdir(), "flare-planner-fixture-"));
const resolvedFixtureRoot = resolve(fixtureRoot);
if (
  dirname(resolvedFixtureRoot) !== resolve(tmpdir()) ||
  !basename(resolvedFixtureRoot).startsWith("flare-planner-fixture-") ||
  basename(resolvedFixtureRoot).length <= "flare-planner-fixture-".length
) {
  throw new Error(
    `Refusing to use an unexpected planner fixture directory: ${resolvedFixtureRoot}`,
  );
}
try {
  const unsupportedDestination = join(fixtureRoot, "flare-unsupported-profile");
  const cli = Bun.spawn(
    [
      process.execPath,
      resolve(import.meta.dir, "../bin/create-flare-stack.ts"),
      unsupportedDestination,
      "--preset",
      "unknown",
    ],
    { cwd: fixtureRoot, stdout: "pipe", stderr: "pipe" },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    cli.exited,
    new Response(cli.stdout).text(),
    new Response(cli.stderr).text(),
  ]);
  assert.equal(exitCode, 2, `${stdout}\n${stderr}`);
  assert.match(stderr, /not available.*app, fullstack, worker/i);
  assert.equal(existsSync(unsupportedDestination), false);

  const packageDirectory = join(fixtureRoot, "flare-package");
  mkdirSync(packageDirectory);
  writeFileSync(
    join(packageDirectory, "package.json"),
    JSON.stringify({ name: "flare", version: FLARE_VERSION }),
  );
  const localDirectoryOptions = makeProjectOptions(
    parseArguments([`flare-local-path-${process.pid}`, "--flare-package", packageDirectory]),
  );
  assert.equal(localDirectoryOptions.flarePackagePath, resolve(packageDirectory));

  const manifest = Buffer.from(JSON.stringify({ name: "flare", version: FLARE_VERSION }));
  const header = Buffer.alloc(512);
  header.write("package/package.json", 0, "utf8");
  header.write(`${manifest.length.toString(8).padStart(11, "0")}\0`, 124, "utf8");
  const paddedManifest = Buffer.alloc(Math.ceil(manifest.length / 512) * 512);
  manifest.copy(paddedManifest);
  const tarball = join(fixtureRoot, "flare-0.14.1.tgz");
  writeFileSync(tarball, gzipSync(Buffer.concat([header, paddedManifest, Buffer.alloc(1024)])));
  const localTarballOptions = makeProjectOptions(
    parseArguments([`flare-local-tarball-${process.pid}`, "--flare-package", tarball]),
  );
  assert.equal(localTarballOptions.flarePackagePath, resolve(tarball));

  writeFileSync(
    join(packageDirectory, "package.json"),
    JSON.stringify({ name: "unrelated-flare", version: FLARE_VERSION }),
  );
  rejects(
    () =>
      makeProjectOptions(
        parseArguments([`flare-unrelated-${process.pid}`, "--flare-package", packageDirectory]),
      ),
    /must be flare@0\.14\.1/i,
  );
} finally {
  rmSync(resolvedFixtureRoot, { recursive: true, force: true });
}

console.log("Planner validation passed for app, fullstack, D1, and optional-auth combinations.");
