import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  callWhoAmI,
  parseWorkersDevSubdomainResponse,
  parseWhoAmIAccountId,
  patchRuntimeHosts,
  resolveCloudflareAuthHosts,
} from "../src/commands/hosts";
import type { CliDependencies } from "../src/commands/common";
import { loadProject } from "../src/project";

const accountId = "a".repeat(32);
const apiToken = "fixture-token-must-not-leak";
const fixtureRoot = await mkdtemp(join(tmpdir(), "flare-host-discovery-"));
const resolvedFixtureRoot = resolve(fixtureRoot);
assert.equal(dirname(resolvedFixtureRoot), resolve(tmpdir()));
assert.ok(basename(resolvedFixtureRoot).startsWith("flare-host-discovery-"));

try {
  await mkdir(join(fixtureRoot, "apps", "web"), { recursive: true });
  await writeFile(
    join(fixtureRoot, "flare.config.ts"),
    `export default ${JSON.stringify({
      schemaVersion: 1,
      flareVersion: "0.14.1",
      productionBranch: "main",
      preset: "app",
      database: "d1",
      auth: "better-auth",
      observability: "none",
      uiLint: "none",
      capabilities: [],
      deployment: { provider: "cloudflare", productionBranch: "main" },
    })};\n`,
  );
  const wranglerConfig = {
    name: "flare-host-fixture",
    account_id: accountId,
    vars: {
      FLARE_ENVIRONMENT: "production",
      AUTH_ALLOWED_HOSTS: "production.placeholder",
      AUTH_PROTOCOL: "http",
    },
    previews: {
      vars: {
        FLARE_ENVIRONMENT: "preview",
        AUTH_ALLOWED_HOSTS: "preview.placeholder",
        AUTH_PROTOCOL: "http",
      },
    },
    env: {
      preview: {
        vars: {
          FLARE_ENVIRONMENT: "preview",
          AUTH_ALLOWED_HOSTS: "preview.placeholder",
          AUTH_PROTOCOL: "http",
        },
      },
    },
  };
  await writeFile(
    join(fixtureRoot, "apps", "web", "wrangler.jsonc"),
    `${JSON.stringify(wranglerConfig)}\n`,
  );
  const project = await loadProject(fixtureRoot);
  const whoAmIAccountId = parseWhoAmIAccountId(
    {
      loggedIn: true,
      authType: "oauth",
      accounts: [{ name: "Fixture account", id: accountId }],
      tokenPermissions: [],
    },
    project,
    { env: {} },
    true,
  );
  assert.equal(whoAmIAccountId, accountId);
  assert.equal(
    callWhoAmI(project, {
      env: {},
      runner: () => ({
        status: 0,
        stdout: JSON.stringify({
          loggedIn: true,
          authType: "oauth",
          accounts: [{ name: "Fixture account", id: accountId }],
        }),
        stderr: "",
      }),
    }),
    accountId,
  );

  let apiCalls = 0;
  const deps: CliDependencies = {
    env: { CLOUDFLARE_API_TOKEN: apiToken },
    fetcher: async (input, init) => {
      apiCalls += 1;
      assert.equal(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`,
      );
      assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${apiToken}`);
      assert.equal(new Headers(init?.headers).get("accept"), "application/json");
      return Response.json({ success: true, result: { subdomain: "fixture-zone" } });
    },
  };

  const discovered = await resolveCloudflareAuthHosts([], project, deps, whoAmIAccountId);
  assert.deepEqual(discovered, {
    production: "flare-host-fixture.fixture-zone.workers.dev",
    preview: "*-flare-host-fixture.fixture-zone.workers.dev",
  });
  const patched = JSON.parse(
    patchRuntimeHosts(project.wranglerSource, project, discovered.production, discovered.preview),
  ) as typeof wranglerConfig;
  assert.equal(patched.vars.AUTH_ALLOWED_HOSTS, discovered.production);
  assert.equal(patched.previews.vars.AUTH_ALLOWED_HOSTS, discovered.preview);
  assert.equal(patched.env.preview.vars.AUTH_ALLOWED_HOSTS, discovered.preview);
  assert.equal(patched.vars.AUTH_PROTOCOL, "https");
  assert.equal(patched.previews.vars.AUTH_PROTOCOL, "https");
  assert.equal(patched.env.preview.vars.AUTH_PROTOCOL, "https");
  assert.equal(apiCalls, 1);

  const partialOverride = await resolveCloudflareAuthHosts(
    ["--public-host", "custom.example.test"],
    project,
    deps,
  );
  assert.deepEqual(partialOverride, {
    production: "custom.example.test",
    preview: "*-flare-host-fixture.fixture-zone.workers.dev",
  });
  assert.equal(apiCalls, 2);

  const bothOverrides = await resolveCloudflareAuthHosts(
    [
      "--public-host",
      "custom.example.test",
      "--preview-host",
      "*-flare-host-fixture.example.workers.dev",
    ],
    project,
    {
      env: {},
      fetcher: async () => {
        throw new Error("explicit host overrides must not fetch");
      },
    },
  );
  assert.deepEqual(bothOverrides, {
    production: "custom.example.test",
    preview: "*-flare-host-fixture.example.workers.dev",
  });
  assert.equal(apiCalls, 2);

  const envOverrides = await resolveCloudflareAuthHosts([], project, {
    env: {
      FLARE_PUBLIC_HOST: "env.example.test",
      FLARE_PREVIEW_HOST: "*-flare-host-fixture.env.workers.dev",
    },
    fetcher: async () => {
      throw new Error("environment host overrides must not fetch");
    },
  });
  assert.deepEqual(envOverrides, {
    production: "env.example.test",
    preview: "*-flare-host-fixture.env.workers.dev",
  });

  assert.equal(
    parseWorkersDevSubdomainResponse({ success: true, result: { subdomain: "valid-zone" } }),
    "valid-zone",
  );
  for (const invalid of [
    null,
    [],
    { success: false, result: { subdomain: "valid-zone" } },
    { success: true, result: {} },
    { success: true, result: { subdomain: "-invalid" } },
    { success: true, result: { subdomain: "invalid-" } },
    { success: true, result: { subdomain: "zone.with.dot" } },
    { success: true, result: { subdomain: "bad zone" } },
  ]) {
    assert.throws(() => parseWorkersDevSubdomainResponse(invalid));
  }

  const unavailable = async (fetcher: NonNullable<CliDependencies["fetcher"]>) => {
    try {
      await resolveCloudflareAuthHosts([], project, {
        env: { CLOUDFLARE_API_TOKEN: apiToken },
        fetcher,
      });
      assert.fail("expected hostname discovery to fail closed");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      assert.match(message, /CLOUDFLARE_API_TOKEN/);
      assert.match(message, /Workers Scripts Read/);
      assert.equal(message.includes(apiToken), false);
    }
  };

  await unavailable(async () => new Response("denied", { status: 403 }));
  await unavailable(async () => new Response("not-json", { status: 200 }));
  await unavailable(async () =>
    Response.json({ success: true, result: { subdomain: "bad.name" } }),
  );
  await unavailable(async () => {
    throw new Error(`transport error included ${apiToken}`);
  });

  await assert.rejects(
    resolveCloudflareAuthHosts([], project, {
      env: { CLOUDFLARE_API_TOKEN: apiToken, CLOUDFLARE_ACCOUNT_ID: "not-an-id" },
      fetcher: async () => Response.json({ success: true, result: { subdomain: "zone" } }),
    }),
    /account ID is missing or malformed/,
  );
  await assert.rejects(
    resolveCloudflareAuthHosts([], project, {
      env: {},
      fetcher: async () => {
        assert.fail("missing API token must fail before making a request");
      },
    }),
    /CLOUDFLARE_API_TOKEN is required/,
  );
  await assert.rejects(
    resolveCloudflareAuthHosts([], project, {
      env: { CLOUDFLARE_API_TOKEN: apiToken, CLOUDFLARE_ACCOUNT_ID: "b".repeat(32) },
      fetcher: async () => Response.json({ success: true, result: { subdomain: "zone" } }),
    }),
    /does not match apps\/web\/wrangler.jsonc account_id/,
  );
  await assert.rejects(
    resolveCloudflareAuthHosts(
      [],
      project,
      {
        env: { CLOUDFLARE_API_TOKEN: apiToken },
        fetcher: async () => {
          assert.fail("a Wrangler account mismatch must fail before making a request");
        },
      },
      "b".repeat(32),
    ),
    /does not match Wrangler whoami/,
  );
  assert.throws(
    () =>
      parseWhoAmIAccountId(
        {
          loggedIn: true,
          authType: "oauth",
          accounts: [{ name: "Other account", id: "b".repeat(32) }],
        },
        project,
        { env: {} },
        true,
      ),
    /does not match any account returned by Wrangler whoami/,
  );
  const wranglerWithoutAccount = { ...wranglerConfig };
  delete (wranglerWithoutAccount as Partial<typeof wranglerConfig>).account_id;
  await writeFile(
    join(fixtureRoot, "apps", "web", "wrangler.jsonc"),
    `${JSON.stringify(wranglerWithoutAccount)}\n`,
  );
  const projectWithoutAccount = await loadProject(fixtureRoot);
  const inferredAccountId = parseWhoAmIAccountId(
    {
      loggedIn: true,
      authType: "oauth",
      accounts: [{ name: "Fixture account", id: accountId }],
      tokenPermissions: [],
    },
    projectWithoutAccount,
    { env: {} },
    true,
  );
  assert.equal(inferredAccountId, accountId);
  let inferredRequestUrl = "";
  await resolveCloudflareAuthHosts(
    [],
    projectWithoutAccount,
    {
      env: { CLOUDFLARE_API_TOKEN: apiToken },
      fetcher: async (input) => {
        inferredRequestUrl =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        return Response.json({ success: true, result: { subdomain: "fixture-zone" } });
      },
    },
    inferredAccountId,
  );
  assert.equal(
    inferredRequestUrl,
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`,
  );
  assert.equal(
    parseWhoAmIAccountId(
      {
        loggedIn: true,
        authType: "oauth",
        accounts: [{ name: "Fixture account", id: accountId }],
      },
      projectWithoutAccount,
      { env: { CLOUDFLARE_ACCOUNT_ID: accountId } },
      true,
    ),
    accountId,
  );
  assert.throws(
    () =>
      parseWhoAmIAccountId(
        {
          loggedIn: true,
          authType: "oauth",
          accounts: [
            { name: "Fixture account", id: accountId },
            { name: "Second account", id: "b".repeat(32) },
          ],
        },
        projectWithoutAccount,
        { env: {} },
        true,
      ),
    /Wrangler returned multiple accounts and no account is selected/,
  );
  assert.throws(
    () =>
      parseWhoAmIAccountId(
        { loggedIn: true, authType: "oauth", accounts: [] },
        projectWithoutAccount,
        { env: {} },
        true,
      ),
    /Wrangler did not return an account ID/,
  );
  await assert.rejects(
    resolveCloudflareAuthHosts([], projectWithoutAccount, {
      env: { CLOUDFLARE_API_TOKEN: apiToken },
      fetcher: async () => {
        assert.fail("missing account ID must fail before making a request");
      },
    }),
    /Could not determine a valid Cloudflare account ID/,
  );

  console.log("Cloudflare Worker hostname discovery fixtures passed.");
} finally {
  await rm(resolvedFixtureRoot, { recursive: true, force: true });
}
