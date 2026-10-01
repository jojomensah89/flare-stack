import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { FLARE_VERSION } from "../packages/create-flare-stack/src/model";
import { makeReleaseMetadata } from "../packages/create-flare-stack/src/release";

export interface ReleaseAsset {
  name: string;
  path: string;
  sizeBytes: number;
  sha256: string;
}

export interface PreparedRelease {
  version: string;
  tag: string;
  owner: string;
  repository: string;
  outDir: string;
  generatorArchive: ReleaseAsset;
  flareArchive: ReleaseAsset;
  uploadCommand: string;
  setupCommand: string;
}

function parseArgs(args: string[]): {
  owner?: string;
  repository?: string;
  tag?: string;
  outDir: string;
  quiet?: boolean;
} {
  let owner = process.env.FLARE_GITHUB_OWNER;
  let repository = process.env.FLARE_GITHUB_REPO;
  let tag = process.env.FLARE_RELEASE_TAG;
  let outDir = "dist/release";
  let quiet = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--owner" && args[i + 1]) {
      owner = args[++i];
    } else if (arg.startsWith("--owner=")) {
      owner = arg.slice("--owner=".length);
    } else if (arg === "--repo" && args[i + 1]) {
      repository = args[++i];
    } else if (arg.startsWith("--repo=")) {
      repository = arg.slice("--repo=".length);
    } else if (arg === "--tag" && args[i + 1]) {
      tag = args[++i];
    } else if (arg.startsWith("--tag=")) {
      tag = arg.slice("--tag=".length);
    } else if (arg === "--out-dir" && args[i + 1]) {
      outDir = args[++i];
    } else if (arg.startsWith("--out-dir=")) {
      outDir = arg.slice("--out-dir=".length);
    } else if (arg === "--quiet") {
      quiet = true;
    }
  }

  return { owner, repository, tag, outDir, quiet };
}

function sha256File(path: string): string {
  const content = readFileSync(path);
  return createHash("sha256").update(content).digest("hex");
}

function checkVersionParity(repoRoot: string): void {
  const rootManifest = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
    version: string;
  };
  const flareManifest = JSON.parse(
    readFileSync(join(repoRoot, "packages/flare/package.json"), "utf8"),
  ) as { version: string };
  const generatorManifest = JSON.parse(
    readFileSync(join(repoRoot, "packages/create-flare-stack/package.json"), "utf8"),
  ) as { version: string };

  assert.equal(
    rootManifest.version,
    FLARE_VERSION,
    `Root package.json version (${rootManifest.version}) does not match FLARE_VERSION (${FLARE_VERSION})`,
  );
  assert.equal(
    flareManifest.version,
    FLARE_VERSION,
    `packages/flare package.json version (${flareManifest.version}) does not match FLARE_VERSION (${FLARE_VERSION})`,
  );
  assert.equal(
    generatorManifest.version,
    FLARE_VERSION,
    `packages/create-flare-stack package.json version (${generatorManifest.version}) does not match FLARE_VERSION (${FLARE_VERSION})`,
  );
}

function verifyArchiveContents(archivePath: string, expectedFiles: string[]): void {
  const tarListing = spawnSync("tar", ["-tf", archivePath], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (tarListing.status !== 0) {
    throw new Error(`Failed to list contents of archive ${archivePath}: ${tarListing.stderr}`);
  }
  const files = new Set(
    tarListing.stdout
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/^\.\//, "")),
  );

  for (const expected of expectedFiles) {
    assert.ok(files.has(expected), `Archive ${archivePath} is missing required entry: ${expected}`);
  }
}

export function prepareRelease(
  options: {
    repoRoot?: string;
    owner?: string;
    repository?: string;
    tag?: string;
    outDir?: string;
    quiet?: boolean;
  } = {},
): PreparedRelease {
  const repoRoot = options.repoRoot ?? resolve(import.meta.dir, "..");
  checkVersionParity(repoRoot);

  const outDir = resolve(repoRoot, options.outDir ?? "dist/release");
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  const flarePackageDir = join(repoRoot, "packages/flare");
  const generatorPackageDir = join(repoRoot, "packages/create-flare-stack");

  // 1. Pack packages/flare
  const flarePack = spawnSync(process.execPath, ["pm", "pack", "--destination", outDir], {
    cwd: flarePackageDir,
    encoding: "utf8",
    windowsHide: true,
  });
  if (flarePack.status !== 0) {
    throw new Error(`Failed to pack flare package: ${flarePack.stderr}`);
  }
  const flareArchivePath = join(outDir, `flare-${FLARE_VERSION}.tgz`);
  assert.ok(existsSync(flareArchivePath), `Expected flare archive at ${flareArchivePath}`);
  verifyArchiveContents(flareArchivePath, [
    "package/package.json",
    "package/bin/flare.ts",
    "package/src/index.ts",
  ]);

  // 2. Pack packages/create-flare-stack
  const generatorPack = spawnSync(process.execPath, ["pm", "pack", "--destination", outDir], {
    cwd: generatorPackageDir,
    encoding: "utf8",
    windowsHide: true,
  });
  if (generatorPack.status !== 0) {
    throw new Error(`Failed to pack create-flare-stack package: ${generatorPack.stderr}`);
  }
  const generatorArchivePath = join(outDir, `create-flare-stack-${FLARE_VERSION}.tgz`);
  assert.ok(
    existsSync(generatorArchivePath),
    `Expected generator archive at ${generatorArchivePath}`,
  );
  verifyArchiveContents(generatorArchivePath, [
    "package/package.json",
    "package/bin/create-flare-stack.ts",
    `package/templates/${FLARE_VERSION}/base/package.json`,
  ]);

  const releaseMeta = makeReleaseMetadata({
    owner: options.owner,
    repository: options.repository,
    tag: options.tag,
  });

  const flareArchive: ReleaseAsset = {
    name: `flare-${FLARE_VERSION}.tgz`,
    path: flareArchivePath,
    sizeBytes: statSync(flareArchivePath).size,
    sha256: sha256File(flareArchivePath),
  };

  const generatorArchive: ReleaseAsset = {
    name: `create-flare-stack-${FLARE_VERSION}.tgz`,
    path: generatorArchivePath,
    sizeBytes: statSync(generatorArchivePath).size,
    sha256: sha256File(generatorArchivePath),
  };

  const uploadCommand = `gh release create ${releaseMeta.tag} --title "${releaseMeta.tag}" --notes "Flare Stack v${releaseMeta.version} release." "${generatorArchivePath}" "${flareArchivePath}"`;
  const setupCommand = `bunx --bun --package ${releaseMeta.generatorReleaseUrl} create-flare-stack my-app --db d1 --auth`;

  const result: PreparedRelease = {
    version: releaseMeta.version,
    tag: releaseMeta.tag,
    owner: releaseMeta.owner,
    repository: releaseMeta.repository,
    outDir,
    generatorArchive,
    flareArchive,
    uploadCommand,
    setupCommand,
  };

  if (!options.quiet) {
    console.log("=================================================");
    console.log(`Flare Stack Release Prepared (v${result.version})`);
    console.log("=================================================");
    console.log(
      `Target: https://github.com/${result.owner}/${result.repository}/releases/tag/${result.tag}`,
    );
    console.log(`Output Directory: ${outDir}\n`);
    console.log("Archives:");
    console.log(`  - ${generatorArchive.name} (${generatorArchive.sizeBytes} bytes)`);
    console.log(`    SHA256: ${generatorArchive.sha256}`);
    console.log(`  - ${flareArchive.name} (${flareArchive.sizeBytes} bytes)`);
    console.log(`    SHA256: ${flareArchive.sha256}\n`);
    console.log("To create and upload this GitHub Release:");
    console.log(`  ${uploadCommand}\n`);
    console.log("User Scaffolding Command (once published):");
    console.log(`  ${setupCommand}\n`);
  }

  return result;
}

if (import.meta.main) {
  const args = parseArgs(process.argv.slice(2));
  prepareRelease(args);
}
