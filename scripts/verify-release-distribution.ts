import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { makeProjectOptions, parseArguments } from "../packages/create-flare-stack/src/args";
import { FLARE_VERSION } from "../packages/create-flare-stack/src/model";
import { createProjectPlan } from "../packages/create-flare-stack/src/plan";
import { createProject } from "../packages/create-flare-stack/src/workflow";
import { prepareRelease } from "./prepare-release";

const rootTemp = mkdtempSync(join(tmpdir(), "flare-release-dist-"));
const resolvedRootTemp = resolve(rootTemp);
assert.equal(dirname(resolvedRootTemp), resolve(tmpdir()));
assert.ok(basename(resolvedRootTemp).startsWith("flare-release-dist-"));

const args = process.argv.slice(2);
const fullMode = args.includes("--full") || !args.includes("--quick");

console.log("==========================================================");
console.log(`Verifying Flare Stack GitHub Release Distribution (v${FLARE_VERSION})`);
console.log("==========================================================\n");

try {
  const releaseDir = join(resolvedRootTemp, "release");
  console.log("1. Preparing release archives...");
  const release = prepareRelease({
    outDir: releaseDir,
    quiet: true,
  });

  const generatorBytes = readFileSync(release.generatorArchive.path);
  const flareBytes = readFileSync(release.flareArchive.path);

  console.log("2. Launching loopback HTTP release archive server...");
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === `/${release.generatorArchive.name}`) {
        return new Response(generatorBytes, {
          headers: {
            "Content-Type": "application/gzip",
            "Content-Length": String(generatorBytes.byteLength),
          },
        });
      }
      if (url.pathname === `/${release.flareArchive.name}`) {
        return new Response(flareBytes, {
          headers: {
            "Content-Type": "application/gzip",
            "Content-Length": String(flareBytes.byteLength),
          },
        });
      }
      return new Response("Not Found", { status: 404 });
    },
  });

  const baseUrl = `http://127.0.0.1:${server.port}`;
  const remoteGeneratorUrl = `${baseUrl}/${release.generatorArchive.name}`;
  const remoteFlareUrl = `${baseUrl}/${release.flareArchive.name}`;

  console.log(`   Loopback release server running at ${baseUrl}`);
  console.log(`   - Generator: ${remoteGeneratorUrl}`);
  console.log(`   - Flare CLI: ${remoteFlareUrl}\n`);

  async function runAsync(
    command: string[],
    cwd: string,
    timeoutMs = 60000,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const proc = Bun.spawn(command, {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });

    const timer = setTimeout(() => {
      try {
        proc.kill();
      } catch {}
    }, timeoutMs);

    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    clearTimeout(timer);
    return { exitCode, stdout, stderr };
  }

  console.log("3. Verifying remote execution via bunx --bun --package...");
  const bunxHelp = await runAsync(
    [
      process.execPath,
      "x",
      "--bun",
      "--package",
      remoteGeneratorUrl,
      "create-flare-stack",
      "--help",
    ],
    resolvedRootTemp,
  );
  assert.equal(
    bunxHelp.exitCode,
    0,
    `bunx failed with status ${bunxHelp.exitCode}: ${bunxHelp.stderr}\n${bunxHelp.stdout}`,
  );
  assert.ok(
    bunxHelp.stdout.includes("create-flare-stack <directory>"),
    "Help output must display create-flare-stack usage",
  );
  console.log("   ✓ Remote archive downloaded, extracted, and executed via bunx successfully.\n");

  console.log("4. Verifying project generation with HTTP archive dependencies...");
  const profiles = [
    { name: "test-app", preset: "app", database: "none", auth: "none" },
    { name: "test-d1", preset: "app", database: "d1", auth: "none" },
    { name: "test-auth", preset: "app", database: "d1", auth: "better-auth" },
    { name: "test-fullstack", preset: "fullstack", database: "d1", auth: "better-auth" },
  ] as const;

  for (const profile of profiles) {
    const projectDir = join(resolvedRootTemp, profile.name);
    console.log(
      `   Generating profile \`${profile.name}\` (preset: ${profile.preset}, db: ${profile.database}, auth: ${profile.auth})...`,
    );

    const parsed = parseArguments([
      projectDir,
      "--preset",
      profile.preset,
      "--db",
      profile.database,
      `--auth=${profile.auth}`,
      "--flare-package",
      remoteFlareUrl,
    ]);
    const options = makeProjectOptions(parsed, resolvedRootTemp);
    const plan = createProjectPlan(options);

    // Skip validation commands for rapid matrix validation, then validate full app for the complete profile
    const isFullCandidate = fullMode && profile.name === "test-auth";
    await createProject(plan, { skipValidationCommands: !isFullCandidate });

    const manifestPath = join(projectDir, "package.json");
    assert.ok(existsSync(manifestPath), `Manifest must exist at ${manifestPath}`);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    assert.equal(
      manifest.devDependencies?.flare,
      remoteFlareUrl,
      "Generated project devDependencies.flare must match the remote archive URL",
    );

    if (profile.preset === "fullstack") {
      assert.ok(
        existsSync(join(projectDir, "apps/server/src/index.ts")),
        "apps/server/src/index.ts must exist in fullstack",
      );
    }
    if (profile.database === "d1") {
      assert.ok(existsSync(join(projectDir, "packages/db")), "D1 packages/db must exist");
    }
    if (profile.auth === "better-auth") {
      assert.ok(
        existsSync(join(projectDir, "apps/web/src/server/auth.ts")),
        "Better Auth integration must exist",
      );
    }

    console.log(
      `   ✓ Profile \`${profile.name}\` generated and verified (${isFullCandidate ? "full install/check/build" : "static verification"}).`,
    );
  }

  await server.stop(true);
  console.log("\n==========================================================");
  console.log("All GitHub Release Distribution verifications PASSED!");
  console.log("==========================================================");
} finally {
  rmSync(resolvedRootTemp, { recursive: true, force: true });
}
