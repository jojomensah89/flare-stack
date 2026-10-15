import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runLocalSetup } from "../src/setup";
import {
  loadProject,
  getAppD1Bindings,
  getResourceProject,
  getRequiredSecrets,
} from "../src/project";
import { commandSetupCloudflare } from "../src/commands/setup";
import { getNeonDatabaseUrl, migrationArgs } from "../src/commands/db";
import { commandSecrets } from "../src/commands/secrets";
import { withBuiltDeploymentConfig, withBuiltServerDeploymentConfig } from "../src/commands/common";
import type { CommandRunner } from "../src/runner";

const root = mkdtempSync(join(tmpdir(), "flare-fullstack-resources-"));
const web = join(root, "apps", "web");
const server = join(root, "apps", "server");
const productionId = "11111111-1111-1111-1111-111111111111";
const previewId = "22222222-2222-2222-2222-222222222222";
const calls: Array<{ args: string[]; cwd: string; input?: string }> = [];
const output = { log: () => undefined, warn: () => undefined, error: () => undefined };
const json = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value));
const vars = (environment: string, host: string) => ({
  FLARE_ENVIRONMENT: environment,
  AUTH_ALLOWED_HOSTS: host,
  AUTH_PROTOCOL: environment === "development" ? "http" : "https",
});
const binding = (environment: string, id: string) => [
  { binding: "DB", database_name: `roles-${environment}`, database_id: id },
];

try {
  mkdirSync(web, { recursive: true });
  mkdirSync(server, { recursive: true });
  writeFileSync(join(root, ".gitignore"), ".dev.vars\n.preview.vars\n");
  writeFileSync(
    join(root, "flare.config.ts"),
    `export default ${JSON.stringify({ schemaVersion: 1, flareVersion: "0.14.1", productionBranch: "main", preset: "fullstack", frontend: "router", database: "d1", auth: "better-auth", observability: "evlog", uiLint: "shadcn", capabilities: [], deployment: { provider: "cloudflare", productionBranch: "main" } })};`,
  );
  json(join(web, "wrangler.jsonc"), {
    name: "roles-web",
    vars: { FLARE_ENVIRONMENT: "production" },
    secrets: { required: [] },
    env: {
      development: { vars: { FLARE_ENVIRONMENT: "development" }, secrets: { required: [] } },
      preview: {
        name: "roles-web-preview",
        vars: { FLARE_ENVIRONMENT: "preview" },
        secrets: { required: [] },
      },
    },
  });
  json(join(server, "wrangler.jsonc"), {
    name: "roles-server",
    workers_dev: false,
    vars: vars("production", "<public-host>"),
    secrets: { required: ["BETTER_AUTH_SECRET"] },
    d1_databases: binding("production", "placeholder-production"),
    env: {
      development: {
        vars: vars("development", "localhost:5173"),
        secrets: { required: ["BETTER_AUTH_SECRET"] },
        d1_databases: binding("development", "local-only"),
      },
      preview: {
        name: "roles-server-preview",
        vars: vars("preview", "<preview-host>"),
        secrets: { required: ["BETTER_AUTH_SECRET"] },
        d1_databases: binding("preview", "placeholder-preview"),
      },
    },
  });
  writeFileSync(join(server, ".dev.vars.example"), "BETTER_AUTH_SECRET=\n");
  writeFileSync(join(server, ".preview.vars.example"), "BETTER_AUTH_SECRET=\n");
  const runner: CommandRunner = (_command, args, options) => {
    calls.push({ args: [...args], cwd: options.cwd, input: options.input });
    let stdout = "";
    if (args[0] === "whoami") stdout = JSON.stringify({ account: "fixture" });
    if (args[0] === "d1" && args[1] === "list")
      stdout = JSON.stringify([
        { name: "roles-production", uuid: productionId },
        { name: "roles-preview", uuid: previewId },
      ]);
    if (args[0] === "d1" && args[1] === "migrations") stdout = "No migrations to apply!";
    if (args[0] === "secret" && args[1] === "list") stdout = "[]";
    return { status: 0, stdout, stderr: "" };
  };
  await runLocalSetup({ startDirectory: root, runner, output });
  assert.ok(existsSync(join(server, ".dev.vars")), "Auth secrets must initialize on server");
  assert.equal(existsSync(join(web, ".dev.vars")), false, "Web must not receive auth secrets");
  assert.deepEqual(
    calls
      .filter((call) => call.args[0] === "types")
      .map((call) => call.cwd)
      .sort(),
    [server, web].sort(),
  );
  let project = await loadProject(root);
  assert.deepEqual(getRequiredSecrets(project), ["BETTER_AUTH_SECRET"]);
  assert.equal(getResourceProject(project).wranglerPath, join(server, "wrangler.jsonc"));
  assert.ok(migrationArgs(project, "preview", false).includes(join(server, "wrangler.jsonc")));
  calls.length = 0;
  await commandSetupCloudflare(project, { runner, output, env: {}, confirm: async () => false }, [
    "--public-host",
    "roles-web.example.workers.dev",
    "--preview-host",
    "roles-web-preview.example.workers.dev",
  ]);
  project = await loadProject(root);
  assert.equal(getAppD1Bindings(project).production.databaseId, productionId);
  assert.equal(getAppD1Bindings(project).preview.databaseId, previewId);
  const source = readFileSync(join(server, "wrangler.jsonc"), "utf8");
  assert.ok(source.includes("roles-web.example.workers.dev"));
  assert.ok(source.includes("roles-web-preview.example.workers.dev"));
  assert.equal(
    readFileSync(join(web, "wrangler.jsonc"), "utf8").includes("AUTH_ALLOWED_HOSTS"),
    false,
  );
  const secretCalls = calls.filter((call) => call.args[0] === "secret" && call.args[1] === "bulk");
  assert.equal(secretCalls.length, 2);
  assert.ok(
    secretCalls.every(
      (call) => call.cwd === server && call.args.includes(join(server, "wrangler.jsonc")),
    ),
  );
  assert.ok(
    secretCalls.some((call) => call.args.includes("--env") && call.args.includes("preview")),
  );
  assert.ok(
    secretCalls.some((call) => call.args.includes("--name") && call.args.includes("roles-server")),
  );
  calls.length = 0;
  assert.equal(await commandSecrets(project, { runner, output }, "list", ["--env", "local"]), 0);
  assert.equal(calls.length, 0, "Local secret checks must not contact Cloudflare");

  const builtWebDirectory = join(web, "dist", "web");
  const builtServerDirectory = join(web, "dist", "server");
  const deployDirectory = join(web, ".wrangler", "deploy");
  mkdirSync(builtWebDirectory, { recursive: true });
  mkdirSync(builtServerDirectory, { recursive: true });
  mkdirSync(deployDirectory, { recursive: true });
  json(join(deployDirectory, "config.json"), {
    configPath: "../../dist/web/worker.json",
  });
  json(join(builtWebDirectory, "worker.json"), {
    name: "roles-web-preview",
    services: [{ binding: "SERVER", service: "roles-server" }],
  });
  assert.throws(
    () => withBuiltDeploymentConfig(project, ["deploy"], "preview"),
    /must bind SERVER to roles-server-preview/,
    "A preview web artifact must not retain its production SERVER binding",
  );
  json(join(builtWebDirectory, "worker.json"), {
    name: "roles-web-preview",
    account_id: "stale-account",
    services: [{ binding: "SERVER", service: "roles-server-preview" }],
  });
  assert.throws(
    () => withBuiltDeploymentConfig(project, ["deploy"], "preview"),
    /web Worker account_id does not match/,
    "A built web artifact must match its source account",
  );

  json(join(builtServerDirectory, "wrangler.json"), {
    name: "roles-server-preview",
    d1_databases: binding("production", productionId),
  });
  assert.throws(
    () => withBuiltServerDeploymentConfig(project, ["deploy"], "preview"),
    /must use the preview D1 database/,
    "A preview server artifact must not retain its production D1 binding",
  );
  json(join(builtServerDirectory, "wrangler.json"), {
    name: "roles-server-preview",
    account_id: "stale-account",
    d1_databases: binding("preview", previewId),
  });
  assert.throws(
    () => withBuiltServerDeploymentConfig(project, ["deploy"], "preview"),
    /server Worker account_id does not match/,
    "A built server artifact must match its source account",
  );

  const neonRoot = join(root, "neon");
  const neonWeb = join(neonRoot, "apps", "web");
  const neonServer = join(neonRoot, "apps", "server");
  mkdirSync(neonWeb, { recursive: true });
  mkdirSync(neonServer, { recursive: true });
  writeFileSync(
    join(neonRoot, "flare.config.ts"),
    `export default ${JSON.stringify({ schemaVersion: 1, flareVersion: "0.14.1", productionBranch: "main", preset: "fullstack", frontend: "router", database: "neon", auth: "none", observability: "evlog", uiLint: "shadcn", capabilities: [], deployment: { provider: "cloudflare", productionBranch: "main" } })};`,
  );
  const neonWrangler = (name: string) => ({
    name,
    vars: { FLARE_ENVIRONMENT: "production" },
    secrets: { required: [] },
    env: {
      development: { vars: { FLARE_ENVIRONMENT: "development" }, secrets: { required: [] } },
      preview: {
        name: `${name}-preview`,
        vars: { FLARE_ENVIRONMENT: "preview" },
        secrets: { required: [] },
      },
    },
  });
  json(join(neonWeb, "wrangler.jsonc"), neonWrangler("roles-neon-web"));
  json(join(neonServer, "wrangler.jsonc"), neonWrangler("roles-neon-server"));
  writeFileSync(join(neonWeb, ".dev.vars"), "DATABASE_URL=postgresql://wrong-web-dev/db\n");
  writeFileSync(join(neonWeb, ".preview.vars"), "DATABASE_URL=postgresql://wrong-web-preview/db\n");
  writeFileSync(join(neonServer, ".dev.vars"), "DATABASE_URL=postgresql://server-dev/db\n");
  writeFileSync(join(neonServer, ".preview.vars"), "DATABASE_URL=postgresql://server-preview/db\n");
  const neonProject = await loadProject(neonRoot);
  assert.equal(getNeonDatabaseUrl(neonProject, { env: {} }, "local"), "postgresql://server-dev/db");
  assert.equal(
    getNeonDatabaseUrl(neonProject, { env: {} }, "preview"),
    "postgresql://server-preview/db",
  );
  assert.throws(
    () =>
      getNeonDatabaseUrl(
        neonProject,
        { env: { DATABASE_URL: "postgresql://server-preview/db" } },
        "preview",
      ),
    /preview and production migration URLs must be different/,
    "A preview migration must reject the production database URL",
  );

  const webConfig = JSON.parse(readFileSync(join(web, "wrangler.jsonc"), "utf8")) as Record<
    string,
    unknown
  >;
  const serverConfig = JSON.parse(readFileSync(join(server, "wrangler.jsonc"), "utf8")) as Record<
    string,
    unknown
  >;
  json(join(web, "wrangler.jsonc"), { ...webConfig, account_id: "web-account" });
  json(join(server, "wrangler.jsonc"), { ...serverConfig, account_id: "server-account" });
  const mismatchedProject = await loadProject(root);
  assert.throws(
    () => getResourceProject(mismatchedProject),
    /must declare the same account_id/,
    "Fullstack resource operations must reject mismatched accounts",
  );
  console.log(
    "Fullstack resource fixtures passed: server-only auth secrets/D1/Neon vars, concrete resource IDs, public auth hosts, persistent preview secret targets, isolated built preview bindings, and account parity. No remote operation was performed.",
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
