import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Verify the archive consumers receive, including files package managers omit by default.
const root = mkdtempSync(join(tmpdir(), "flare-packed-fixture-"));
assert.equal(dirname(resolve(root)), resolve(tmpdir()));
assert.ok(basename(root).startsWith("flare-packed-fixture-"));
const packageDirectory = resolve(import.meta.dir, "..");
const flarePackageDirectory = resolve(import.meta.dir, "../../flare");

function assertBrowserPackages(projectDirectory: string): void {
  const extensionDirectory = join(projectDirectory, "apps", "extension");
  const outputDirectory = join(extensionDirectory, ".output");
  const archives = readdirSync(outputDirectory).filter((filename) => filename.endsWith(".zip"));
  for (const browser of ["chrome", "firefox", "edge"] as const) {
    assert.ok(
      archives.some((filename) => filename.endsWith(`-${browser}.zip`)),
      `Extension packaging must produce a ${browser} archive; received: ${archives.join(", ")}`,
    );
    const manifestPath = join(outputDirectory, `${browser}-mv3`, "manifest.json");
    assert.ok(existsSync(manifestPath), `${browser} Manifest V3 build must exist`);
    const browserManifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      manifest_version?: number;
    };
    assert.equal(browserManifest.manifest_version, 3, `${browser} output must use Manifest V3`);
  }
}

try {
  const flarePack = spawnSync(process.execPath, ["pm", "pack", "--destination", root], {
    cwd: flarePackageDirectory,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(
    flarePack.status,
    0,
    `Local Flare package packing must succeed: ${flarePack.stderr}\n${flarePack.stdout}`,
  );
  const localFlareArchive = join(root, "flare-0.14.1.tgz");
  assert.ok(existsSync(localFlareArchive), "Packed generator fixture needs a local Flare archive");

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
  assert.ok(
    help.stdout.includes("--preset app|fullstack|worker|extension"),
    "Packed CLI help must advertise the extension preset",
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
    { name: "packed-extension", preset: "extension", database: "none", auth: "none" },
  ]) {
    const destination = join(root, profile.name);
    const profileArgs = [
      destination,
      "--preset",
      profile.preset,
      "--db",
      profile.database,
      `--auth=${profile.auth}`,
      ...(profile.preset === "extension" ? ["--flare-package", localFlareArchive] : []),
    ];
    const options = argsModule.makeProjectOptions(argsModule.parseArguments(profileArgs));
    if (profile.preset === "extension") {
      const generated = spawnSync(
        process.execPath,
        [join(packedRoot, "bin", "create-flare-stack.ts"), ...profileArgs],
        {
          cwd: root,
          encoding: "utf8",
          maxBuffer: 20 * 1024 * 1024,
          windowsHide: true,
        },
      );
      assert.equal(
        generated.status,
        0,
        `Packed extension generation and validation must succeed:\n${generated.stdout}\n${generated.stderr}`,
      );
      assert.ok(generated.stdout.includes("Preset: extension | Database: none | Auth: none"));
      assert.ok(generated.stdout.includes("bun run package"));
      assert.ok(!generated.stdout.includes("  bun preview"));
      assert.ok(!generated.stdout.includes("  bun deploy"));
      assert.ok(!generated.stdout.includes("flare setup cloudflare"));

      const packageResult = spawnSync(process.execPath, ["run", "package"], {
        cwd: destination,
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
        windowsHide: true,
      });
      assert.equal(
        packageResult.status,
        0,
        `Extension browser packaging must succeed:\n${packageResult.stdout}\n${packageResult.stderr}`,
      );
      assertBrowserPackages(destination);
    } else {
      await workflowModule.createProject(planModule.createProjectPlan(options), {
        skipValidationCommands: true,
      });
    }
    const packageJson = JSON.parse(readFileSync(join(destination, "package.json"), "utf8"));
    assert.equal(
      packageJson.devDependencies?.flare,
      profile.preset === "extension"
        ? `file:${localFlareArchive.replaceAll("\\", "/")}`
        : "https://github.com/jojomensah89/flare-stack/releases/download/v0.14.1/flare-0.14.1.tgz",
      "Generated project must pin Flare to its selected release archive",
    );
    const ignore = readFileSync(join(destination, ".gitignore"), "utf8");
    assert.ok(ignore.includes(".dev.vars") && ignore.includes(".preview.vars"));
    assert.ok(existsSync(join(destination, ".oxlintrc.json")));
    if (profile.preset === "extension") {
      assert.ok(existsSync(join(destination, "apps/extension/wxt.config.ts")));
      assert.ok(existsSync(join(destination, "apps/extension/entrypoints/popup/App.tsx")));
      assert.ok(!existsSync(join(destination, "apps/web")));
      assert.ok(!existsSync(join(destination, "apps/server")));
    } else {
      const previewExamplePath =
        profile.preset === "worker"
          ? "apps/server/.preview.vars.example"
          : "apps/web/.preview.vars.example";
      assert.equal(
        existsSync(join(destination, previewExamplePath)),
        profile.auth === "better-auth" || profile.database === "neon",
      );
    }
  }
  console.log(
    "Packed generator passed: archive paths and all templates; the extension also passed local Flare install/setup/check/build and Chrome/Firefox/Edge Manifest V3 packaging.",
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
