import assert from "node:assert/strict";
import { createAuth, validateAuthRequestOrigin } from "../apps/web/src/server/auth";
import { createD1Fixture } from "./fixtures/d1";
import { resolveAuthConfig } from "../apps/web/src/server/auth-config";

const fixture = createD1Fixture();
const secret = "fixture-only-32-character-secret-" + crypto.randomUUID();
const bindings = {
  DB: fixture.binding,
  AUTH_ALLOWED_HOSTS: "localhost:5173",
  AUTH_PROTOCOL: "http",
  BETTER_AUTH_SECRET: secret,
};

function request(
  path: string,
  options: { origin?: string; ip?: string; cookie?: string; body?: object } = {},
) {
  const origin = options.origin ?? "http://localhost:5173";
  return new Request(`${origin}/api/auth/${path}`, {
    method: options.body ? "POST" : "GET",
    headers: {
      host: new URL(origin).host,
      origin,
      "content-type": "application/json",
      "cf-connecting-ip": options.ip ?? "198.51.100.10",
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
}

async function expectSuccess(auth: ReturnType<typeof createAuth>, req: Request) {
  const response = await auth.handler(req);
  assert.equal(response.status, 200, `Auth request failed: ${new URL(req.url).pathname}`);
  return response;
}

async function expectHostRejected(auth: ReturnType<typeof createAuth>, req: Request) {
  try {
    const response = await auth.handler(req);
    assert.ok(
      response.status === 400 || response.status === 403,
      "Unknown host must be rejected on an existing endpoint",
    );
  } catch (error) {
    if (error instanceof assert.AssertionError) throw error;
    assert.match(String(error), /allowed host|host.*allow|invalid.*host|base.?url/i);
  }
}

try {
  const previewBindings = {
    ...bindings,
    FLARE_ENVIRONMENT: "preview",
    AUTH_ALLOWED_HOSTS: "*-fixture-web.account.workers.dev",
    AUTH_PROTOCOL: "https",
  };
  resolveAuthConfig(previewBindings);
  validateAuthRequestOrigin(
    request("get-session", { origin: "https://branch-fixture-web.account.workers.dev" }),
    previewBindings,
  );
  assert.throws(
    () => resolveAuthConfig({ ...previewBindings, FLARE_ENVIRONMENT: "production" }),
    /preview pattern/i,
  );
  assert.throws(
    () => resolveAuthConfig({ ...previewBindings, AUTH_ALLOWED_HOSTS: "*.workers.dev" }),
    /worker-scoped/i,
  );
  assert.throws(
    () => resolveAuthConfig({ ...previewBindings, AUTH_ALLOWED_HOSTS: "*-fixture.example.com" }),
    /preview pattern/i,
  );
  assert.throws(
    () =>
      validateAuthRequestOrigin(
        request("get-session", { origin: "https://branch-other-web.account.workers.dev" }),
        previewBindings,
      ),
    /origin/i,
  );
  assert.throws(() => createAuth({ ...bindings, BETTER_AUTH_SECRET: undefined }), /secret/i);
  assert.throws(() => createAuth({ ...bindings, AUTH_PROTOCOL: "auto" }), /protocol/i);
  const auth = createAuth(bindings);
  validateAuthRequestOrigin(request("get-session"), bindings);
  assert.throws(
    () =>
      validateAuthRequestOrigin(
        request("get-session", { origin: "http://attacker.example" }),
        bindings,
      ),
    /origin|host/i,
  );
  const mismatchedHost = request("get-session");
  mismatchedHost.headers.set("host", "attacker.example");
  assert.throws(() => validateAuthRequestOrigin(mismatchedHost, bindings), /origin|host/i);
  await expectSuccess(auth, request("get-session"));
  await expectHostRejected(auth, request("get-session", { origin: "http://attacker.example" }));
  const spoof = request("get-session");
  spoof.headers.set("x-forwarded-host", "attacker.example");
  validateAuthRequestOrigin(spoof, bindings);
  await expectSuccess(auth, spoof);
  const email = "fixture-local@flare.example";
  const password = "fixturePassword123!";
  const signup = await expectSuccess(
    auth,
    request("sign-up/email", { body: { email, password, name: "Fixture" } }),
  );
  const cookie = signup.headers.get("set-cookie");
  assert.ok(cookie && cookie.includes("session_token"), "Signup must issue a session cookie");
  assert.doesNotMatch(cookie, /;\s*Secure(?:;|$)/i, "HTTP development cookies must work locally");
  const sessionCookie = cookie.split(";")[0];
  assert.ok(fixture.sqlite.query("SELECT id FROM user WHERE email = ?").get(email));
  const before = JSON.stringify(
    fixture.sqlite.query("SELECT * FROM rate_limit ORDER BY key").all(),
  );
  const session = await expectSuccess(
    createAuth(bindings),
    request("get-session", { cookie: sessionCookie }),
  );
  const sessionBody = (await session.json()) as { user?: { email: string } };
  assert.equal(
    sessionBody.user?.email,
    email,
    "A new auth instance must read the persisted session",
  );
  assert.equal(
    JSON.stringify(fixture.sqlite.query("SELECT * FROM rate_limit ORDER BY key").all()),
    before,
    "get-session must not write rate-limit counters",
  );
  const invalid = await auth.handler(
    request("sign-in/email", { body: { email, password: "incorrect" } }),
  );
  assert.ok(invalid.status === 400 || invalid.status === 401);
  const signin = await expectSuccess(auth, request("sign-in/email", { body: { email, password } }));
  const activeCookie = signin.headers.get("set-cookie")?.split(";")[0];
  assert.ok(activeCookie);
  await expectSuccess(auth, request("sign-out", { cookie: activeCookie, body: {} }));
  const signedOut = await expectSuccess(auth, request("get-session", { cookie: activeCookie }));
  assert.equal(await signedOut.json(), null, "Signout must invalidate the session");
  const production = createAuth({
    ...bindings,
    AUTH_ALLOWED_HOSTS: "app.example.com",
    AUTH_PROTOCOL: "https",
  });
  const secureSignup = await expectSuccess(
    production,
    request("sign-up/email", {
      origin: "https://app.example.com",
      ip: "198.51.100.20",
      body: { email: "fixture-secure@flare.example", password, name: "Secure fixture" },
    }),
  );
  assert.match(secureSignup.headers.get("set-cookie") ?? "", /;\s*Secure(?:;|$)/i);
  const attackerIp = "203.0.113.195";
  let limited = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    const response = await createAuth(bindings).handler(
      request("sign-in/email", { ip: attackerIp, body: { email, password: "incorrect" } }),
    );
    if (response.status === 429) {
      limited = true;
      break;
    }
  }
  assert.ok(limited, "Database rate limits must survive newly created auth instances");
  const counters = fixture.sqlite.query("SELECT key, count FROM rate_limit").all() as {
    key: string;
    count: number;
  }[];
  assert.ok(
    counters.some((row) => row.key.includes(attackerIp) && row.count > 0),
    "Counter key must include cf-connecting-ip",
  );
  console.log(
    "Auth local fixture passed: hosts, signup/session/signout, secure cookies, durable rate limits, session-read exemption. Cloudflare/browser acceptance is separate.",
  );
} finally {
  fixture.sqlite.close();
}
