import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { commandDeploy } from "../src/commands/deploy";
import { commandPreviewClean, commandResources } from "../src/commands/operations";
import { commandRollback } from "../src/commands/rollback";
import { loadProject } from "../src/project";
import type { RunResult } from "../src/runner";

interface Call {
  command: string;
  args: string[];
  cwd: string;
}

const roots: string[] = [];

function fixtureProject(
  preset: "app" | "fullstack",
  webConfig: Record<string, unknown>,
  serverConfig?: Record<string, unknown>,
): string {
  const root = mkdtempSync(join(tmpdir(), "flare-operations-"));
  roots.push(root);
  const webDirectory = join(root, "apps", "web");
  mkdirSync(webDirectory, { recursive: true });
  writeFileSync(
    join(root, "flare.config.ts"),
    `export default ${JSON.stringify(
      {
        schemaVersion: 1,
        flareVersion: "0.14.1",
        productionBranch: "main",
        preset,
        database: "none",
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
  writeFileSync(join(webDirectory, "wrangler.jsonc"), JSON.stringify(webConfig, null, 2), "utf8");
  if (preset === "fullstack") {
    if (!serverConfig) throw new Error("The fullstack fixture requires a server Wrangler config.");
    const serverDirectory = join(root, "apps", "server");
    mkdirSync(serverDirectory, { recursive: true });
    writeFileSync(
      join(serverDirectory, "wrangler.jsonc"),
      JSON.stringify(serverConfig, null, 2),
      "utf8",
    );
  }
  return root;
}

function previewFixture(
  config: Record<string, unknown> = { name: "flare-operations-app", previews: {} },
): string {
  return fixtureProject("app", config);
}

function baseOutput(logs: string[], errors: string[]) {
  return {
    log: (message: string) => logs.push(String(message)),
    warn: (message: string) => logs.push(String(message)),
    error: (message: string) => errors.push(String(message)),
  };
}

function success(stdout = ""): RunResult {
  return { status: 0, stdout, stderr: "" };
}

function view(id: string, tag: string, createdOn: string): string {
  return JSON.stringify({
    id,
    annotations: { "workers/tag": tag, "workers/message": `fixture release ${tag}` },
    metadata: { created_on: createdOn, source: "wrangler" },
  });
}

function deployment(id: string, createdOn: string): Record<string, unknown> {
  return { created_on: createdOn, versions: [{ version_id: id, percentage: 100 }] };
}

async function testPreviewCleanSuccessAndCancel(): Promise<void> {
  const root = previewFixture();
  const project = await loadProject(root);
  const logs: string[] = [];
  const errors: string[] = [];
  const calls: Call[] = [];
  let confirmed = 0;
  const status = await commandPreviewClean(
    project,
    {
      cwd: root,
      confirm: async () => {
        confirmed += 1;
        return true;
      },
      output: baseOutput(logs, errors),
      runner: (command, args, options) => {
        calls.push({ command, args, cwd: options.cwd });
        return success("Preview deleted");
      },
    },
    ["--name", "feature-fixture"],
  );

  assert.equal(status, 0);
  assert.equal(confirmed, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.command, "wrangler");
  assert.deepEqual(calls[0]?.args.slice(0, 7), [
    "preview",
    "delete",
    "--name",
    "feature-fixture",
    "--worker-name",
    "flare-operations-app",
    "--skip-confirmation",
  ]);
  assert.ok(logs.some((message) => message.includes("resources will not be deleted")));
  assert.ok(logs.some((message) => message.includes("Declared resources were left intact")));
  assert.equal(errors.length, 0);

  calls.length = 0;
  const cancelled = await commandPreviewClean(
    project,
    {
      cwd: root,
      confirm: async () => false,
      output: baseOutput(logs, errors),
      runner: (command, args, options) => {
        calls.push({ command, args, cwd: options.cwd });
        return success();
      },
    },
    ["--name", "feature-fixture"],
  );
  assert.equal(cancelled, 1);
  assert.equal(calls.length, 0, "a declined cleanup must not invoke Wrangler");
}

async function testProductionResourceGuard(): Promise<void> {
  const root = previewFixture({
    name: "flare-operations-app",
    d1_databases: [{ binding: "DB", database_name: "flare-prod", database_id: "prod-d1-id" }],
    previews: {
      d1_databases: [{ binding: "DB", database_name: "flare-prod", database_id: "prod-d1-id" }],
    },
  });
  const project = await loadProject(root);
  const calls: Call[] = [];
  await assert.rejects(
    commandPreviewClean(
      project,
      {
        cwd: root,
        confirm: async () => true,
        runner: (command, args, options) => {
          calls.push({ command, args, cwd: options.cwd });
          return success();
        },
      },
      ["--name", "feature-fixture"],
    ),
    /points to the production resource/,
  );
  assert.equal(calls.length, 0, "production-bound preview cleanup must fail before Wrangler");
}

async function testResourcesRedactSecretValues(): Promise<void> {
  const root = previewFixture({
    name: "flare-operations-app",
    vars: { API_TOKEN: "do-not-print-this" },
    secrets: { required: ["DATABASE_URL"] },
    d1_databases: [{ binding: "DB", database_name: "flare-prod", database_id: "prod-d1-id" }],
    previews: {
      d1_databases: [
        { binding: "DB", database_name: "flare-preview", database_id: "preview-d1-id" },
      ],
    },
  });
  const project = await loadProject(root);
  const logs: string[] = [];
  const errors: string[] = [];
  const status = await commandResources(
    project,
    {
      cwd: root,
      output: baseOutput(logs, errors),
      runner: () => {
        throw new Error("Resource listing must not call Wrangler or read a secret store.");
      },
    },
    [],
  );
  const text = logs.join("\n");
  assert.equal(status, 0);
  assert.ok(text.includes("d1_databases binding=DB name=flare-prod id=prod-d1-id"));
  assert.ok(text.includes("d1_databases binding=DB name=flare-preview id=preview-d1-id"));
  assert.ok(!text.includes("do-not-print-this"));
  assert.ok(!text.includes("DATABASE_URL"));
  assert.equal(errors.length, 0);
}

async function testFullstackDeployUsesSharedReleaseTag(): Promise<void> {
  const webConfig = {
    name: "flare-operations-web",
    vars: { FLARE_ENVIRONMENT: "production", BUILD_TARGET: "production" },
    secrets: { required: [] },
    previews: {
      vars: { FLARE_ENVIRONMENT: "preview", BUILD_TARGET: "worker-preview" },
    },
    env: {
      development: {
        vars: { FLARE_ENVIRONMENT: "development", BUILD_TARGET: "development" },
        secrets: { required: [] },
      },
      preview: {
        vars: { FLARE_ENVIRONMENT: "preview", BUILD_TARGET: "environment-preview" },
        secrets: { required: [] },
      },
    },
  };
  const root = fixtureProject("fullstack", webConfig, { name: "flare-operations-server" });
  const webDirectory = join(root, "apps", "web");
  const generatedDirectory = join(webDirectory, ".wrangler", "deploy");
  mkdirSync(generatedDirectory, { recursive: true });
  writeFileSync(
    join(generatedDirectory, "config.json"),
    JSON.stringify({ configPath: "../../wrangler.generated.json" }),
    "utf8",
  );
  writeFileSync(
    join(webDirectory, "wrangler.generated.json"),
    JSON.stringify({ name: "flare-operations-web" }),
    "utf8",
  );

  const project = await loadProject(root);
  const calls: Call[] = [];
  const logs: string[] = [];
  const errors: string[] = [];
  const status = await commandDeploy(
    project,
    {
      cwd: root,
      output: baseOutput(logs, errors),
      fetcher: async (input) => {
        const url =
          input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
        return new Response(url.pathname === "/" ? "ok" : JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
      runner: (command, args, options) => {
        calls.push({ command, args, cwd: options.cwd });
        return success(
          command === "wrangler" && args[0] === "deploy" && options.cwd === webDirectory
            ? "https://flare-operations-web.account.workers.dev"
            : "",
        );
      },
    },
    [],
  );
  assert.equal(status, 0, errors.join("\n"));
  assert.equal(errors.length, 0);
  const deployCalls = calls.filter(
    (call) => call.command === "wrangler" && call.args[0] === "deploy",
  );
  assert.equal(deployCalls.length, 2);
  const tags = deployCalls.map((call) => {
    const tagIndex = call.args.indexOf("--tag");
    return tagIndex === -1 ? undefined : call.args[tagIndex + 1];
  });
  assert.ok(
    tags[0] && tags[0] === tags[1],
    "server and web Workers must receive the same release tag",
  );
  assert.match(
    tags[0] ?? "",
    /^flare:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  assert.ok(deployCalls[0]?.cwd.endsWith(join("apps", "server")));
  assert.ok(deployCalls[1]?.cwd.endsWith(join("apps", "web")));
  assert.ok(logs.some((message) => message.includes(tags[0] ?? "")));
}

async function testPairedRollbackHistoryAndOrder(): Promise<void> {
  const root = fixtureProject(
    "fullstack",
    { name: "flare-operations-web", previews: {} },
    { name: "flare-operations-server" },
  );
  const project = await loadProject(root);
  const calls: Call[] = [];
  const logs: string[] = [];
  const errors: string[] = [];
  const currentDate = "2026-10-01T10:00:00.000Z";
  const priorDate = "2026-09-30T10:00:00.000Z";
  const versions: Record<string, string> = {
    "web-current": view("web-current", "flare:current-release", currentDate),
    "web-prior": view("web-prior", "flare:prior-release", priorDate),
    "server-current": view("server-current", "flare:current-release", currentDate),
    "server-prior": view("server-prior", "flare:prior-release", priorDate),
  };
  const histories = new Map<string, unknown[]>([
    [
      join(root, "apps", "web"),
      [deployment("web-current", currentDate), deployment("web-prior", priorDate)],
    ],
    [
      join(root, "apps", "server"),
      [deployment("server-current", currentDate), deployment("server-prior", priorDate)],
    ],
  ]);
  const status = await commandRollback(
    project,
    {
      cwd: root,
      output: baseOutput(logs, errors),
      fetcher: async (input) => {
        const url =
          input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
        return new Response(url.pathname === "/" ? "ok" : JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
      runner: (command, args, options) => {
        calls.push({ command, args, cwd: options.cwd });
        if (args[0] === "deployments" && args[1] === "list") {
          return success(JSON.stringify(histories.get(options.cwd)));
        }
        if (args[0] === "versions" && args[1] === "view") {
          const version = versions[args[2] ?? ""];
          return version
            ? success(version)
            : { status: 1, stdout: "", stderr: "Missing fixture version" };
        }
        if (args[0] === "rollback") return success("https://fixture.example.workers.dev");
        throw new Error(`Unexpected operation command: ${command} ${args.join(" ")}`);
      },
    },
    ["--url", "https://fixture.example.test"],
  );
  assert.equal(status, 0);
  assert.equal(errors.length, 0, errors.join("\n"));
  const rollbackCalls = calls.filter((call) => call.args[0] === "rollback");
  assert.deepEqual(
    rollbackCalls.map((call) => call.args[1]),
    ["web-prior", "server-prior"],
  );
  assert.ok(rollbackCalls[0]?.cwd.endsWith(join("apps", "web")));
  assert.ok(rollbackCalls[1]?.cwd.endsWith(join("apps", "server")));
  assert.ok(rollbackCalls.every((call) => call.args.includes("--yes")));
  assert.ok(!calls.some((call) => call.args.some((arg) => arg === "migrate" || arg === "reset")));
}

async function testExpiredPairedVersionRefusal(): Promise<void> {
  const root = fixtureProject(
    "fullstack",
    { name: "flare-operations-web", previews: {} },
    { name: "flare-operations-server" },
  );
  const project = await loadProject(root);
  const calls: Call[] = [];
  const createdOn = "2026-09-30T10:00:00.000Z";
  const histories = new Map<string, unknown[]>([
    [
      join(root, "apps", "web"),
      [
        {
          ...deployment("web-old", createdOn),
          annotations: { "workers/tag": "flare:old-release" },
        },
      ],
    ],
    [
      join(root, "apps", "server"),
      [
        {
          ...deployment("server-old", createdOn),
          annotations: { "workers/tag": "flare:old-release" },
        },
      ],
    ],
  ]);
  await assert.rejects(
    commandRollback(
      project,
      {
        cwd: root,
        runner: (command, args, options) => {
          calls.push({ command, args, cwd: options.cwd });
          if (args[0] === "deployments" && args[1] === "list") {
            return success(JSON.stringify(histories.get(options.cwd)));
          }
          if (args[0] === "versions" && args[1] === "view") {
            if (args[2] === "web-old")
              return success(view("web-old", "flare:old-release", createdOn));
            return { status: 1, stdout: "", stderr: "Version not found (404)" };
          }
          if (args[0] === "rollback") return success("Unexpected rollback");
          throw new Error(`Unexpected operation command: ${command} ${args.join(" ")}`);
        },
      },
      ["--release", "old-release"],
    ),
    /paired version\(s\) no longer retained by Cloudflare: server server-old/,
  );
  assert.equal(calls.filter((call) => call.args[0] === "rollback").length, 0);
}

try {
  await testPreviewCleanSuccessAndCancel();
  await testProductionResourceGuard();
  await testResourcesRedactSecretValues();
  await testFullstackDeployUsesSharedReleaseTag();
  await testPairedRollbackHistoryAndOrder();
  await testExpiredPairedVersionRefusal();
  console.log(
    "Lifecycle operations fixtures passed: preview cleanup confirmation/isolation, secret-safe resource inventory, shared fullstack deploy tag, paired rollback order, and expired-pair refusal.",
  );
} finally {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
}
