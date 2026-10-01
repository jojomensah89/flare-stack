import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { runCli, type CliDependencies } from "../src/cli";
import { getRequiredSecrets, loadProject, getAppD1Bindings } from "../src/project";
import { getProperty, parseJsonc, replaceStringNodes } from "../src/jsonc";
import { runLocalSetup } from "../src/index";
import type { CommandRunner, ManagedCommand, RunOptions, RunResult } from "../src/runner";

const fixtureWorker = "flare-lifecycle-fixture";
const productionDatabaseId = "00000000-0000-0000-0000-000000000001";
const previewDatabaseId = "00000000-0000-0000-0000-000000000002";
const developmentDatabaseId = "00000000-0000-0000-0000-000000000003";

interface RecordedCall {
  command: ManagedCommand;
  args: string[];
  cwd: string;
}

interface FixtureOptions {
  database?: "none" | "d1";
  requiredSecrets?: string[];
}

function success(stdout = ""): RunResult {
  return { status: 0, stdout, stderr: "" };
}

function writeFixture(root: string, options: FixtureOptions = {}): void {
  const database = options.database ?? "none";
  const requiredSecrets = options.requiredSecrets ?? [];
  const webDirectory = join(root, "apps", "web");
  mkdirSync(webDirectory, { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(
    join(root, "flare.config.ts"),
    `export default ${JSON.stringify(
      {
        schemaVersion: 1,
        flareVersion: "0.14.1",
        productionBranch: "main",
        preset: "app",
        database,
        auth: "none",
        observability: "none",
        uiLint: "none",
        capabilities: [],
        deployment: { provider: "cloudflare", productionBranch: "main" },
      },
      null,
      2,
    )};\n`,
    "utf8",
  );

  const development: Record<string, unknown> = {
    secrets: { required: requiredSecrets },
    vars: { FLARE_ENVIRONMENT: "development", BUILD_TARGET: "development" },
  };
  const environmentPreview: Record<string, unknown> = {
    secrets: { required: requiredSecrets },
    vars: { FLARE_ENVIRONMENT: "preview", BUILD_TARGET: "environment-preview" },
  };
  const previews: Record<string, unknown> = {
    vars: { FLARE_ENVIRONMENT: "preview", BUILD_TARGET: "worker-preview" },
  };
  const wrangler: Record<string, unknown> = {
    name: fixtureWorker,
    compatibility_date: "2026-09-30",
    secrets: { required: requiredSecrets },
    vars: { FLARE_ENVIRONMENT: "production", BUILD_TARGET: "production" },
    previews,
    env: { development, preview: environmentPreview },
  };

  if (database === "d1") {
    const productionBinding = {
      binding: "DB",
      database_name: "fixture-web-production",
      database_id: productionDatabaseId,
    };
    const previewBinding = {
      binding: "DB",
      database_name: "fixture-web-preview",
      database_id: previewDatabaseId,
    };
    wrangler.d1_databases = [productionBinding];
    previews.d1_databases = [previewBinding];
    development.d1_databases = [
      {
        binding: "DB",
        database_name: "fixture-web-development",
        database_id: developmentDatabaseId,
      },
    ];
    environmentPreview.d1_databases = [previewBinding];
  }

  writeFileSync(
    join(webDirectory, "wrangler.jsonc"),
    `${JSON.stringify(wrangler, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(join(root, ".gitignore"), ".dev.vars\n.preview.vars\n", "utf8");
}

async function withFixture<T>(
  options: FixtureOptions,
  run: (root: string) => Promise<T>,
): Promise<T> {
  const root = await import("node:fs").then(({ mkdtempSync }) =>
    mkdtempSync(join(tmpdir(), "flare-lifecycle-")),
  );
  assert.equal(dirname(resolve(root)), resolve(tmpdir()));
  assert.ok(basename(root).startsWith("flare-lifecycle-"));
  try {
    writeFixture(root, options);
    return await run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function createRunner(
  root: string,
  options: { redirect?: string; builtWorkerName?: string } = {},
): { runner: CommandRunner; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const runner: CommandRunner = (command, args, runOptions) => {
    calls.push({ command, args: [...args], cwd: runOptions.cwd });
    if (command === "bun") {
      if (args[0] === "run" && args[1] === "check") return success();
      if (args[0] === "run" && args[1] === "build") {
        const webDirectory = join(root, "apps", "web");
        const deployDirectory = join(webDirectory, ".wrangler", "deploy");
        const outputDirectory = join(webDirectory, "dist");
        mkdirSync(deployDirectory, { recursive: true });
        mkdirSync(outputDirectory, { recursive: true });
        writeFileSync(
          join(deployDirectory, "config.json"),
          JSON.stringify({ configPath: options.redirect ?? "../../dist/worker.json" }),
          "utf8",
        );
        writeFileSync(
          join(outputDirectory, "worker.json"),
          JSON.stringify({ name: options.builtWorkerName ?? fixtureWorker }),
          "utf8",
        );
        return success();
      }
      throw new Error(`Unexpected fake Bun command: ${args.join(" ")}`);
    }

    const subcommand = args[0];
    if (subcommand === "whoami") return success('{"account":"fixture"}');
    if (subcommand === "types") return success("Types generated in fixture.");
    if (subcommand === "deploy") {
      if (runOptions.cwd === join(root, "apps", "server")) {
        return success("Uploaded fixture-server\nNo targets deployed for fixture-server");
      }
      assert.equal(runOptions.cwd, join(root, "apps", "web"));
      assert.equal(
        args.includes("--config"),
        false,
        "deploy must follow the Vite-generated config redirect",
      );
      return success(`Uploaded ${fixtureWorker}\nhttps://${fixtureWorker}.workers.dev`);
    }
    if (subcommand === "preview") {
      assert.equal(runOptions.cwd, join(root, "apps", "web"));
      assert.equal(
        args.includes("--config"),
        false,
        "preview must follow the Vite-generated config redirect",
      );
      return success(
        JSON.stringify({
          preview: {
            name: `${fixtureWorker}-preview`,
            urls: [`https://${fixtureWorker}-preview.workers.dev`],
          },
          deployment: { id: "fixture-deployment", urls: [] },
        }),
      );
    }
    if (subcommand === "rollback") {
      assert.ok(
        args.includes("--config"),
        "rollback uses the source config and does not need a fresh build",
      );
      return success(`Rolled back ${fixtureWorker}\nhttps://${fixtureWorker}.workers.dev`);
    }
    throw new Error(`Unexpected fake Wrangler command: ${args.join(" ")}`);
  };
  return { runner, calls };
}

function createDependencies(
  root: string,
  runner: CommandRunner,
  errors: string[] = [],
): CliDependencies {
  return {
    cwd: root,
    env: { ...process.env, CLOUDFLARE_ENV: undefined, WORKERS_CI_BRANCH: "main" },
    runner,
    output: {
      log: () => undefined,
      warn: () => undefined,
      error: (message?: unknown) =>
        errors.push(typeof message === "string" ? message : "Unexpected non-string diagnostic"),
    },
    confirm: async () => false,
    fetcher: async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === "/health" || url.pathname === "/api/health") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response("fixture healthy", { status: 200 });
    },
  };
}

function verifyJsonc(): void {
  const source = `{
    // Line comment with a fake delimiter: /* not a comment */
    "escaped": "quote: \\" slash: \\\\ newline: \\n snowman: \\u2603",
    "url": "https://example.test/path//segment?query=/*literal*/",
    "values": [1, { "enabled": true, },], /* trailing block comment */
  }`;
  const root = parseJsonc(source, "fixture JSONC");
  const escaped = getProperty(root, "escaped");
  assert.equal(escaped?.value, 'quote: " slash: \\ newline: \n snowman: ☃');
  assert.equal(
    getProperty(root, "url")?.value,
    "https://example.test/path//segment?query=/*literal*/",
  );
  assert.equal(getProperty(root, "values")?.type, "array");

  const updated = replaceStringNodes(source, [
    {
      node: escaped!,
      value: 'new "quoted" path \\with\nline',
    },
  ]);
  assert.equal(
    getProperty(parseJsonc(updated), "escaped")?.value,
    'new "quoted" path \\with\nline',
  );

  assert.throws(() => parseJsonc('{"duplicate": 1, "duplicate": 2}'), /duplicate property/);
  assert.throws(() => parseJsonc('{"bad": "\\x"}'), /invalid string escape/);
  assert.throws(() => parseJsonc('{"unterminated": [1, 2'), SyntaxError);
  assert.throws(() => parseJsonc('{"comment": true /*'), /unterminated block comment/);
  assert.throws(() => parseJsonc('{"value": 1} false'), /unexpected content after root value/);
}

async function verifyPublicLocalSetup(): Promise<void> {
  await withFixture({ database: "none" }, async (root) => {
    const calls: RecordedCall[] = [];
    const runner: CommandRunner = (command, args, options: RunOptions) => {
      calls.push({ command, args: [...args], cwd: options.cwd });
      assert.equal(command, "wrangler");
      assert.equal(args[0], "types");
      return success();
    };
    await runLocalSetup({
      startDirectory: root,
      runner,
      output: { log: () => undefined, error: () => undefined, warn: () => undefined },
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.cwd, join(root, "apps", "web"));
    assert.equal(
      existsSync(join(root, ".wrangler")),
      false,
      "a no-database setup must not create D1 state",
    );
    assert.equal(
      existsSync(join(root, "apps", "web", ".dev.vars")),
      false,
      "no required secrets means no local secret file",
    );
  });
}

async function verifyNoDatabaseLifecycle(): Promise<void> {
  await withFixture({ database: "none" }, async (root) => {
    const { runner, calls } = createRunner(root);
    const errors: string[] = [];
    const dependencies = createDependencies(root, runner, errors);

    assert.equal(await runCli(["setup", "cloudflare"], dependencies), 0);
    const updatedConfig = parseJsonc(
      readFileSync(join(root, "apps", "web", "wrangler.jsonc"), "utf8"),
    );
    assert.equal(getProperty(getProperty(updatedConfig, "previews")!, "vars")?.type, "object");
    assert.equal(
      getProperty(
        getProperty(getProperty(updatedConfig, "previews")!, "vars")!,
        "FLARE_ENVIRONMENT",
      )?.value,
      "preview",
      "setup must patch the top-level Worker Preview vars block",
    );
    assert.equal(getProperty(getProperty(updatedConfig, "previews")!, "secrets"), undefined);
    assert.deepEqual(getRequiredSecrets(await loadProject(root)), []);

    assert.equal(await runCli(["deploy"], dependencies), 0);
    assert.equal(await runCli(["preview"], dependencies), 0);
    assert.equal(await runCli(["rollback"], dependencies), 0);

    const deployCall = calls.find(
      (call) => call.command === "wrangler" && call.args[0] === "deploy",
    );
    const previewCall = calls.find(
      (call) => call.command === "wrangler" && call.args[0] === "preview",
    );
    const rollbackCall = calls.find(
      (call) => call.command === "wrangler" && call.args[0] === "rollback",
    );
    assert.ok(deployCall);
    assert.ok(previewCall);
    assert.ok(rollbackCall);
    assert.equal(deployCall.cwd, join(root, "apps", "web"));
    assert.equal(previewCall.cwd, join(root, "apps", "web"));
    assert.ok(
      previewCall.args.some(
        (arg, index) =>
          arg === "--var" && previewCall.args[index + 1] === "BUILD_TARGET:worker-preview",
      ),
    );
    assert.equal(deployCall.args.includes("--config"), false);
    assert.equal(previewCall.args.includes("--config"), false);

    const beforeDatabaseCommands = calls.length;
    assert.equal(await runCli(["db", "status"], dependencies), 1);
    assert.equal(await runCli(["db", "migrate"], dependencies), 1);
    assert.equal(
      calls.length,
      beforeDatabaseCommands,
      "D1-only commands must stop before invoking Wrangler for a no-database app",
    );
    assert.ok(errors.some((message) => message.includes("requires the D1 profile")));
    assert.equal(
      calls.some((call) => call.args[0] === "d1"),
      false,
    );
  });
}

async function verifyDeploymentRedirectValidation(): Promise<void> {
  await withFixture({ database: "none" }, async (root) => {
    const { runner, calls } = createRunner(root, { redirect: "../../../../outside.json" });
    const errors: string[] = [];
    const result = await runCli(
      ["deploy", "--cloudflare-only"],
      createDependencies(root, runner, errors),
    );
    assert.equal(result, 1);
    assert.ok(
      errors.some((message) =>
        message.includes("does not resolve to a built file inside apps/web"),
      ),
    );
    assert.equal(
      calls.some((call) => call.command === "wrangler" && call.args[0] === "deploy"),
      false,
    );
  });
}

async function verifyD1DevelopmentBinding(): Promise<void> {
  await withFixture({ database: "d1" }, async (root) => {
    const bindings = getAppD1Bindings(await loadProject(root));
    assert.equal(bindings.development.databaseName, "fixture-web-development");
    assert.equal(bindings.development.databaseId, developmentDatabaseId);
    assert.equal(bindings.production.databaseId, productionDatabaseId);
    assert.equal(bindings.preview.databaseId, previewDatabaseId);
  });
}

async function verifyMigrationIsolationAndFailures(): Promise<void> {
  await withFixture({ database: "d1" }, async (root) => {
    const calls: RecordedCall[] = [];
    const runner: CommandRunner = (command, args, options) => {
      calls.push({ command, args: [...args], cwd: options.cwd });
      assert.equal(command, "wrangler");
      assert.deepEqual(args.slice(0, 2), ["d1", "migrations"]);
      assert.ok(args.includes("--remote"));
      assert.equal(
        args.includes("--preview"),
        false,
        "legacy --preview does not select Worker Preview resources",
      );
      assert.equal(args[args.indexOf("--env") + 1], "preview");
      return success(
        args[2] === "list"
          ? "Migrations to be applied:\n0000_fixture.sql"
          : "Applied fixture migration",
      );
    };
    assert.equal(
      await runCli(["db", "migrate", "--env", "preview"], createDependencies(root, runner)),
      0,
    );
    assert.deepEqual(
      calls.map((call) => call.args[2]),
      ["list", "apply"],
    );

    const errors: string[] = [];
    const failedRunner: CommandRunner = () => ({
      status: 1,
      stdout: "",
      stderr: "fixture permission denied",
    });
    assert.equal(await runCli(["deploy"], createDependencies(root, failedRunner, errors)), 1);
    assert.ok(errors.some((error) => error.includes("migration status failed")));
    const ambiguousRunner: CommandRunner = () => success("unrecognized migration status");
    assert.equal(await runCli(["deploy"], createDependencies(root, ambiguousRunner, errors)), 1);
    assert.ok(errors.some((error) => error.includes("refusing to continue")));
    let invoked = false;
    const dependencies = createDependencies(
      root,
      () => {
        invoked = true;
        return success();
      },
      errors,
    );
    dependencies.env = { ...dependencies.env, WORKERS_CI_BRANCH: "feature-fixture" };
    assert.equal(await runCli(["deploy"], dependencies), 1);
    assert.equal(
      invoked,
      false,
      "branch guard must stop before remote migration or deploy commands",
    );
  });
}

async function verifySecretsAndBootstrap(): Promise<void> {
  await withFixture({ requiredSecrets: ["BETTER_AUTH_SECRET"] }, async (root) => {
    const web = join(root, "apps", "web");
    writeFileSync(join(web, ".dev.vars.example"), "BETTER_AUTH_SECRET=\n");
    writeFileSync(join(web, ".preview.vars.example"), "BETTER_AUTH_SECRET=\n");
    const calls: RecordedCall[] = [];
    const runner: CommandRunner = (command, args, options) => {
      calls.push({ command, args: [...args], cwd: options.cwd });
      if (args[0] === "whoami") return success('{"account":"fixture"}');
      if (args[0] === "types") return success();
      if (args[0] === "secret" && args[1] === "list") {
        assert.ok(args.includes("--format"));
        assert.equal(args.includes("--json"), false);
        return {
          status: 1,
          stdout: "",
          stderr: `Worker "${fixtureWorker}" not found.\n\nIf this is a new Worker, run \`wrangler deploy\` first to create it.\nOtherwise, check that the Worker name is correct and you're logged into the right account.`,
        };
      }
      if (
        (args[0] === "secret" && args[1] === "bulk") ||
        (args[0] === "preview" && args.includes("bulk"))
      ) {
        assert.ok(options.input && JSON.parse(options.input).BETTER_AUTH_SECRET);
        return success();
      }
      throw new Error(`Unexpected bootstrap command ${args.join(" ")}`);
    };
    const errors: string[] = [];
    const deps = createDependencies(root, runner, errors);
    deps.promptSecret = async () => "fixture-only-random-secret-32-characters";
    assert.equal(await runCli(["setup", "cloudflare"], deps), 0, errors.join("\n"));
    assert.ok(calls.some((call) => call.args[0] === "secret" && call.args[1] === "bulk"));
    assert.ok(calls.some((call) => call.args[0] === "preview" && call.args.includes("bulk")));
    assert.equal(
      await runCli(["secrets", "list", "--env", "production"], deps),
      1,
      "missing Worker may be bootstrapped only during setup",
    );

    rmSync(join(web, ".preview.vars"));
    assert.equal(
      await runCli(["secrets", "generate", "--env", "preview", "BETTER_AUTH_SECRET"], deps),
      0,
    );
    assert.ok(
      /^BETTER_AUTH_SECRET=[A-Za-z0-9_-]{43}$/m.test(
        readFileSync(join(web, ".preview.vars"), "utf8"),
      ),
    );
    assert.equal(
      await runCli(["secrets", "generate", "BETTER_AUTH_SECRET", "--env", "preview"], deps),
      1,
      "generation must preserve existing values",
    );
    assert.equal(
      await runCli(["secrets", "push", "--env", "production", "--replace=false"], deps),
      1,
    );

    const replacementRunner: CommandRunner = (command, args, options) => {
      if (args[0] === "secret" && args[1] === "list")
        return success('[{"name":"BETTER_AUTH_SECRET"}]');
      assert.equal(command, "wrangler");
      assert.deepEqual(args.slice(0, 2), ["secret", "bulk"]);
      assert.ok(options.input);
      return success();
    };
    assert.equal(
      await runCli(["secrets", "push", "--env", "production", "--replace"], {
        ...deps,
        runner: replacementRunner,
      }),
      0,
    );
    assert.equal(
      await runCli(["setup", "cloudflare"], {
        ...deps,
        runner: () => ({ status: 1, stdout: "", stderr: "fixture authentication denied" }),
      }),
      1,
    );
  });
}

async function verifyInvalidHostInputs(): Promise<void> {
  await withFixture({ database: "d1" }, async (root) => {
    const configPath = join(root, "flare.config.ts");
    writeFileSync(
      configPath,
      readFileSync(configPath, "utf8").replace('"auth": "none"', '"auth": "better-auth"'),
    );
    let invoked = false;
    const deps = createDependencies(root, () => {
      invoked = true;
      return success();
    });
    for (const host of [
      "user@app.example.com",
      "app.example.com?value=test",
      "app.example.com#fragment",
    ]) {
      assert.equal(
        await runCli(
          [
            "setup",
            "cloudflare",
            "--public-host",
            host,
            "--preview-host",
            `*-${fixtureWorker}.account.workers.dev`,
          ],
          deps,
        ),
        1,
      );
    }
    assert.equal(invoked, false, "invalid hosts must fail before provisioning");
  });
}

async function verifyFullstackDeployment(): Promise<void> {
  await withFixture({ database: "none" }, async (root) => {
    const configPath = join(root, "flare.config.ts");
    writeFileSync(
      configPath,
      readFileSync(configPath, "utf8").replace('"preset": "app"', '"preset": "fullstack"'),
    );

    const serverDir = join(root, "apps", "server");
    mkdirSync(serverDir, { recursive: true });
    writeFileSync(
      join(serverDir, "wrangler.jsonc"),
      JSON.stringify(
        {
          name: "fixture-server",
          compatibility_date: "2026-09-30",
          workers_dev: false,
          preview_urls: false,
          secrets: { required: [] },
          vars: { FLARE_ENVIRONMENT: "production" },
          env: {
            development: { secrets: { required: [] }, vars: { FLARE_ENVIRONMENT: "development" } },
            preview: { secrets: { required: [] }, vars: { FLARE_ENVIRONMENT: "preview" } },
          },
        },
        null,
        2,
      ),
    );

    const { runner, calls } = createRunner(root);
    const errors: string[] = [];
    const healthChecks: string[] = [];
    const deps = createDependencies(root, runner, errors);
    deps.fetcher = async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      healthChecks.push(url.pathname);
      if (url.pathname === "/api/health" || url.pathname === "/health") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response("fixture healthy", { status: 200 });
    };

    const status = await runCli(["deploy", "--cloudflare-only"], deps);
    assert.equal(status, 0);
    assert.equal(errors.length, 0);

    const serverDeploy = calls.find(
      (call) => call.command === "wrangler" && call.cwd === serverDir && call.args[0] === "deploy",
    );
    const webDeploy = calls.find(
      (call) =>
        call.command === "wrangler" &&
        call.cwd === join(root, "apps", "web") &&
        call.args[0] === "deploy",
    );
    assert.ok(serverDeploy, "Must deploy apps/server");
    assert.ok(webDeploy, "Must deploy apps/web");
    const serverIndex = calls.indexOf(serverDeploy);
    const webIndex = calls.indexOf(webDeploy);
    assert.ok(serverIndex < webIndex, "Server must be deployed before web");
    assert.ok(
      healthChecks.includes("/api/health"),
      "Health check must verify /api/health for fullstack",
    );
  });
}

async function main(): Promise<void> {
  verifyJsonc();
  await verifyPublicLocalSetup();
  await verifyNoDatabaseLifecycle();
  await verifyDeploymentRedirectValidation();
  await verifyD1DevelopmentBinding();
  await verifyMigrationIsolationAndFailures();
  await verifySecretsAndBootstrap();
  await verifyInvalidHostInputs();
  await verifyFullstackDeployment();
  assert.equal(
    await runCli(["--help"], {
      cwd: tmpdir(),
      output: { log: () => undefined, warn: () => undefined, error: () => undefined },
    }),
    0,
  );
  console.log(
    "Flare lifecycle fixtures passed: JSONC, setup, no-database lifecycle, built-config redirects, isolated remote-preview migration arguments, fail-closed status/branch guards, secret commands/bootstrap, exact hosts, fullstack multi-worker orchestration, and help. No remote operation was performed.",
  );
}

await main();
