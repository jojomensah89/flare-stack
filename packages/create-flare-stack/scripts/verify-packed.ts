import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Verify the archive consumers receive, including files package managers omit by default.
const root = mkdtempSync(join(tmpdir(), "flare-packed-fixture-"));
assert.equal(dirname(resolve(root)), resolve(tmpdir()));
assert.ok(basename(root).startsWith("flare-packed-fixture-"));
const packageDirectory = resolve(import.meta.dir, "..");

try {
  const pack = spawnSync(process.execPath, ["pm", "pack", "--destination", root], {
    cwd: packageDirectory,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(pack.status, 0, "Local generator packing must succeed");
  const archive = join(root, "create-flare-stack-0.14.1.tgz");
  const listing = spawnSync("tar", ["-tf", archive], { encoding: "utf8", windowsHide: true });
  assert.equal(listing.status, 0, "Packed archive must be readable");
  for (const filename of listing.stdout.trim().split(/\r?\n/)) {
    assert.ok(
      filename.startsWith("package/") && !filename.split("/").includes(".."),
      "Archive paths must remain inside package/",
    );
  }
  const unpacked = join(root, "unpacked");
  mkdirSync(unpacked);
  const extract = spawnSync("tar", ["-xf", archive, "-C", unpacked], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(extract.status, 0, "Local archive extraction must succeed");
  const packedRoot = join(unpacked, "package");
  const manifest = JSON.parse(readFileSync(join(packedRoot, "package.json"), "utf8"));
  assert.equal(manifest.name, "create-flare-stack");
  assert.equal(manifest.version, "0.14.1");
  const help = spawnSync(
    process.execPath,
    [join(packedRoot, "bin", "create-flare-stack.ts"), "--help"],
    { encoding: "utf8", windowsHide: true },
  );
  assert.equal(help.status, 0, "Packed Bun entrypoint must run outside the workspace");
  assert.ok(
    help.stdout.includes("bunx --bun --package"),
    "Packed CLI help must display the GitHub release entrypoint",
  );
  const argsModule = (await import(
    pathToFileURL(join(packedRoot, "src", "args.ts")).href
  )) as typeof import("../src/args");
  const planModule = (await import(
    pathToFileURL(join(packedRoot, "src", "plan.ts")).href
  )) as typeof import("../src/plan");
  const workflowModule = (await import(
    pathToFileURL(join(packedRoot, "src", "workflow.ts")).href
  )) as typeof import("../src/workflow");
  for (const profile of [
    { name: "packed-app", preset: "app", database: "none", auth: "none" },
    { name: "packed-d1", preset: "app", database: "d1", auth: "none" },
    { name: "packed-auth", preset: "app", database: "d1", auth: "better-auth" },
    { name: "packed-fullstack-auth", preset: "fullstack", database: "d1", auth: "better-auth" },
    { name: "packed-neon", preset: "app", database: "neon", auth: "none" },
    { name: "packed-neon-auth", preset: "app", database: "neon", auth: "better-auth" },
    {
      name: "packed-fullstack-neon-auth",
      preset: "fullstack",
      database: "neon",
      auth: "better-auth",
    },
    { name: "packed-worker", preset: "worker", database: "none", auth: "none" },
    { name: "packed-worker-d1", preset: "worker", database: "d1", auth: "none" },
    { name: "packed-worker-neon", preset: "worker", database: "neon", auth: "none" },
  ]) {
    const destination = join(root, profile.name);
    const options = argsModule.makeProjectOptions(
      argsModule.parseArguments([
        destination,
        "--preset",
        profile.preset,
        "--db",
        profile.database,
        `--auth=${profile.auth}`,
      ]),
    );
    await workflowModule.createProject(planModule.createProjectPlan(options), {
      skipValidationCommands: true,
    });
    const packageJson = JSON.parse(readFileSync(join(destination, "package.json"), "utf8"));
    assert.equal(
      packageJson.devDependencies?.flare,
      "https://github.com/jojomensah89/flare-stack/releases/download/v0.14.1/flare-0.14.1.tgz",
      "Generated project must pin flare to the GitHub release archive URL",
    );
    const ignore = readFileSync(join(destination, ".gitignore"), "utf8");
    assert.ok(ignore.includes(".dev.vars") && ignore.includes(".preview.vars"));
    assert.ok(existsSync(join(destination, ".oxlintrc.json")));
    const previewExamplePath =
      profile.preset === "worker"
        ? "apps/server/.preview.vars.example"
        : "apps/web/.preview.vars.example";
    assert.equal(
      existsSync(join(destination, previewExamplePath)),
      profile.auth === "better-auth" || profile.database === "neon",
    );
  }
  console.log(
    "Packed generator passed: archive paths, isolated entrypoint, all three templates, secret ignore files, and Preview example. Full installed-project checks are separate fixtures.",
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
