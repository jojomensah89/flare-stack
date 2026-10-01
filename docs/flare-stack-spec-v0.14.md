# Flare Stack

> Personal startup pack for shipping Cloudflare-first TypeScript products quickly.
>
> **Status:** v0.14 frozen implementation specification (review-complete: draft-Worker secret bootstrap, production auth allowlist isolation, single-build Workers Builds path)  
> **Research re-verified:** 2026-09-30 against current Cloudflare Wrangler, Worker Previews, Service Bindings, Vite plugin, Workers Builds, secrets, D1, Better Auth (including rate-limit storage/IP docs), Drizzle, Neon serverless-driver/Hyperdrive guidance, and Workers Builds branch-control docs  
> **Primary objective:** go from `create` to productive local development and a first Cloudflare deployment in roughly 15 minutes, with local Git-hook quality gates, agent-verifiable UI rules, structured observability, direct PC-to-Cloudflare deployment, and optional Cloudflare-native Git deployment without GitHub Actions.

---

## 1. What Flare is

Flare is **not** a general-purpose stack configurator like Better T Stack.

It is a small, opinionated collection of the project shapes I repeatedly build:

1. a compact full-stack web application where TanStack Start server functions are enough,
2. a larger application with a dedicated frontend and Hono backend,
3. a browser extension built with WXT,
4. a standalone Cloudflare Worker/API/MCP service.

The technologies inside each shape are mostly predetermined. Flare asks only questions that materially change the architecture.

The goal is to remove setup work, not create more choices.

### North-star experience

```bash
bun create flare-stack my-app
```

Flare asks a very small number of questions, scaffolds a known-good monorepo, installs dependencies, configures UI and agent skills, validates the environment, and leaves the project in a state where these commands work immediately:

```bash
cd my-app
bun setup
bun dev
bun check
bun preview     # safe remote preview; topology-aware
bun deploy      # production deploy from this machine
```

---

## 2. Design principles

### 2.1 Project shape first

Do not ask users to independently choose frontend framework, router, backend framework, ORM, formatter, package manager, deployment provider, component system, and every other implementation detail.

Ask what kind of project they are building and derive the stack from that.

### 2.2 Opinionated defaults, limited escape hatches

Flare should have defaults for the tools I already prefer:

- Bun
- TypeScript
- React 19
- TanStack
- Hono when a dedicated backend is needed
- Cloudflare Workers
- Cloudflare Vite plugin
- Drizzle ORM
- D1 or Neon Postgres
- Better Auth when authentication is needed
- Tailwind CSS v4
- shadcn/ui
- Biome
- `@shadcn/lint` for design-system rules
- evlog for server-side structured logging
- Turborepo
- Agent Skills + `AGENTS.md`

Swapping should be possible only where I genuinely use more than one option. Database is one such case: **D1 and Neon are both first-class profiles**.

### 2.3 A generated project must be boring

The generated repository should not contain a complex runtime plugin framework just because the generator supports multiple shapes.

Generation can be sophisticated. The resulting application should be straightforward to understand.

### 2.4 Local development is a product feature

`bun dev` working reliably is part of Flare's product contract.

A starter that deploys but requires an hour of debugging local ports, environment variables, generated Cloudflare types, database bindings, auth callbacks, or monorepo imports has failed.

### 2.5 Cloudflare is the deployment target

Flare does not ask where to deploy.

The answer is Cloudflare.

### 2.6 Agent-native by default

Every generated project should be easy for Codex, Claude Code, Cursor, Gemini CLI, GitHub Copilot, and other Agent Skills-compatible tools to understand.

Project-wide invariants belong in `AGENTS.md`. Specialized procedures belong in skills and load only when relevant.

---

## 3. Core stack

| Concern | Flare choice |
|---|---|
| Package manager | Bun |
| Language | TypeScript |
| Workspace | Bun workspaces |
| Task orchestration | Turborepo |
| Frontend | React 19 |
| Full-stack web framework | TanStack Start |
| SPA routing | TanStack Router |
| Server state | TanStack Query |
| Dedicated API | Hono |
| Fullstack internal API contract | Hono RPC |
| Browser extension | WXT + React |
| Runtime/hosting | Cloudflare Workers |
| Cloudflare build integration | Vite + Cloudflare Vite plugin |
| Cloudflare config | `wrangler.jsonc` (v1 default); `cloudflare.config.ts` experimental opt-in |
| Database ORM | Drizzle |
| Database profile A | Cloudflare D1 |
| Database profile B | Neon Postgres |
| Authentication | Better Auth |
| CSS | Tailwind CSS v4 |
| UI | shadcn/ui |
| Component primitives | Base UI by default |
| Formatting/general linting | Biome |
| UI/design-system linting | `@shadcn/lint` via a minimal ESLint config |
| Server logging/observability | evlog |
| Type gate | TypeScript |
| AI instructions | `AGENTS.md` + Agent Skills |

---

## 4. Project shapes

Flare v1 supports four shapes.

### 4.1 `app` — TanStack Start application

Use this when the application needs a frontend plus a modest amount of server functionality, but does **not** justify a standalone backend.

This is the Anansi-style shape.

```text
apps/
└── web/
    ├── src/
    │   ├── routes/
    │   ├── components/
    │   ├── lib/
    │   ├── server/
    │   └── env/
    ├── components.json
    ├── wrangler.jsonc
    ├── vite.config.ts
    └── package.json

packages/
├── ui/
├── config/
└── db/              # only when database capability is enabled
```

Runtime model:

```text
Browser
  │
  ▼
TanStack Start on Cloudflare
  ├── React UI
  ├── TanStack Router
  ├── server functions
  ├── server routes
  ├── optional Better Auth
  ├── optional MCP endpoint
  └── optional Drizzle
        ├── D1
        └── Neon
```

No `apps/server` is generated.

#### Suitable for

- Anansi-style applications
- indie-hacker tools
- small SaaS products
- dashboards
- CRUD products
- sites with a few private server operations
- small MCP-enabled applications

---

### 4.2 `fullstack` — dedicated web + server

Use this when the backend is a meaningful service of its own.

```text
apps/
├── web/
│   ├── src/
│   ├── components.json
│   ├── wrangler.jsonc
│   ├── vite.config.ts
│   └── package.json
│
└── server/
    ├── src/
    │   ├── routes/
    │   ├── middleware/
    │   ├── services/
    │   ├── auth/
    │   └── env/
    ├── wrangler.jsonc
    └── package.json

packages/
├── ui/
├── db/              # when database is enabled
├── shared/
└── config/
```

The web application uses React 19, Vite, TanStack Router, TanStack Query, and shadcn/ui. The server uses Hono on Cloudflare Workers, plus Drizzle and Better Auth when those capabilities are enabled.

The default internal web-to-server contract is **Hono RPC**. `apps/server` exports the Hono app type and `apps/web` imports it as a **type-only workspace dependency**, making the build relationship explicit to Bun/Turborepo without shipping server runtime code into the browser. OpenAPI + Scalar remain an optional recipe for public APIs. The server exposes a dedicated type-only contract entry (for example `@repo/server/contract`), the web uses `import type`, and Biome enforces type-only imports. No Cloudflare runtime value may be imported through the contract entry. Flare's release fixture compiles the web against the pinned server contract and blocks the release if Worker-global type leakage causes DOM/Workers conflicts; TS project references or generated declarations are the fallback if a pinned toolchain needs stronger isolation.

#### Production topology: separate Workers, one browser origin

`fullstack` keeps `apps/web` and `apps/server` as separate deployable Workers, but exposes only the web Worker to normal browser traffic.

```text
Browser
   │
   │ https://app.example.com  (or the web Worker's workers.dev URL)
   ▼
Web Worker  (public)
   │
   ├── /*        → frontend/static assets
   │
   └── /api/*
        │
        │ Cloudflare Service Binding
        ▼
   Server Worker  (private/internal)
        │
        ├── Hono RPC
        ├── Better Auth
        └── Drizzle
```

Rules:

- The **web Worker owns the public browser origin**.
- Browser API calls use relative paths such as `/api/...`.
- `/api/*` is forwarded by the web Worker to `apps/server` through a Cloudflare **Service Binding**.
- The private server Worker sets `workers_dev: false`, `preview_urls: false`, and declares no public route by default.
- Better Auth cookies remain first-party to the web origin.
- Normal web-to-server traffic needs neither browser CORS nor a `SameSite=None` workaround.
- A public `api.example.com` is added only by an explicit external/public API capability.

The web Worker's static-assets configuration must run the Worker before SPA fallback for API paths:

```jsonc
{
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  }
}
```

The proxy forwards the **original `Request` object** so the public request URL/Host remains authoritative for auth URL derivation:

```ts
if (new URL(request.url).pathname.startsWith("/api/")) {
  return env.SERVER.fetch(request)
}
```

Do not synthesize an internal fake hostname for ordinary forwarding.

#### Fullstack server route contract

The dedicated Hono server receives the original public path and mounts under `/api`:

```ts
const app = new Hono().basePath("/api")

app.get("/health", (c) => c.json({ ok: true }))
// Better Auth remains reachable at /api/auth/*
```

Therefore:

- fullstack public health is `/api/health`,
- Better Auth is `/api/auth/*`,
- Hono RPC is mounted below `/api`,
- the standalone `worker` preset uses `/health` because it has no web forwarder.

#### Local development mirrors production

Flare uses the pinned Cloudflare Vite plugin's **auxiliary Worker** support so local development exercises the same Service Binding path as production instead of swapping it for a generic Vite HTTP proxy.

```text
browser → http://localhost:5173
               │
               ▼
          web Worker
               │
               │ Service Binding
               ▼
          server Worker
```

Conceptual Vite configuration:

```ts
cloudflare({
  configPath: "./wrangler.jsonc",
  persistState: { path: "../../.wrangler/state" },
  auxiliaryWorkers: [
    { configPath: "../server/wrangler.jsonc" },
  ],
})
```

Because the web Vite process starts the server Worker as an auxiliary Worker, **fullstack `bun dev` starts the web workspace only**. It must not also run `apps/server` through `turbo run dev --parallel`, which would double-start the backend and can create port/runtime conflicts.

```json
{
  "scripts": {
    "dev": "turbo run dev --filter=./apps/web"
  }
}
```

The browser still calls `/api/*`, no `VITE_API_URL` is generated for the normal first-party path, and Better Auth's local base URL is the **web origin**.

`auxiliaryWorkers` is version-pinned as part of the Flare compatibility matrix. Flare also keeps a documented fallback that runs the server separately and uses a local `/api` proxy if a pinned Cloudflare Vite release regresses auxiliary-Worker development. The fallback is for local development only; production continues to use Service Bindings.

#### Suitable for

- larger SaaS products,
- products with a public API added later,
- webhook-heavy applications,
- applications with multiple clients,
- applications where the backend needs its own deployment lifecycle.

---

### 4.3 `extension` — WXT browser extension

```text
apps/
└── extension/
    ├── entrypoints/
    ├── components/
    ├── lib/
    ├── assets/
    ├── components.json
    ├── wxt.config.ts
    └── package.json

packages/
├── ui/
├── shared/
└── config/
```

Defaults:

- WXT
- React 19
- TypeScript
- Tailwind v4
- shared shadcn UI where appropriate

The `extension` preset is **extension-only in v1**. It never generates `apps/server` and it has no Cloudflare backend deployable. If an extension needs a backend, create a separate `worker` or `fullstack` Flare project and share packages deliberately. Flare v1 does **not** support `flare add server` as a shape-changing recipe. Shape migration or a first-class multi-surface preset can be added after repeated real-world use proves it is needed.

---

### 4.4 `worker` — standalone Worker/API/MCP service

```text
apps/
└── server/
    ├── src/
    ├── wrangler.jsonc
    ├── vite.config.ts
    └── package.json

packages/
├── config/
└── db/              # optional
```

Defaults:

- Hono
- Cloudflare Workers
- Zod where request validation is needed

Suitable for:

- APIs
- MCP servers
- webhook receivers
- scheduled jobs
- backend experiments
- small services

---

## 5. CLI experience

### Primary command

Publish an npm package named:

```text
create-flare-stack
```

Bun resolves `bun create flare-stack` to `create-flare-stack`, so the main UX is:

```bash
bun create flare-stack my-app
```

Non-interactive examples:

```bash
bun create flare-stack anansi --preset app
bun create flare-stack my-saas --preset fullstack --db neon --auth
bun create flare-stack my-extension --preset extension
bun create flare-stack my-mcp --preset worker --mcp
```

### Interactive flow

Keep the prompt surface small.

```text
◆ What are you building?
  ● App          TanStack Start, server functions included
  ○ Full Stack   React web + dedicated Hono server
  ○ Extension    WXT browser extension
  ○ Worker       Hono Worker/API

◆ Database?
  ● None
  ○ D1
  ○ Neon Postgres

◆ Authentication?
  ● No
  ○ Better Auth

◆ Extra capabilities?
  □ MCP
  □ R2
  □ Email
```

Rules:

- If auth is selected and database is `None`, require a database choice.
- Do not ask which ORM. It is Drizzle.
- Do not ask which auth library. It is Better Auth.
- Do not ask which component system. Web surfaces use shadcn/ui.
- Do not ask where to deploy. It is Cloudflare.
- Do not ask which formatter. It is Biome.

---

## 6. Database architecture: D1 and Neon are first-class

The stable abstraction is **Drizzle + the schema**, not a fake runtime abstraction that pretends SQLite and Postgres are identical.

A project selects one database profile at scaffold time.

### 6.1 D1 profile

Use when:

- staying fully Cloudflare-native matters,
- the product is small or medium,
- operational simplicity matters more than advanced Postgres features,
- the application benefits from a binding rather than a connection URL.

Generated pieces:

```text
packages/db/
├── src/
│   ├── schema/
│   ├── client.ts
│   └── index.ts
├── migrations/
├── drizzle.config.ts
└── package.json
```

The runtime client accepts a Cloudflare D1 binding.

The generated `wrangler.jsonc` declares a D1 binding such as `DB`.

#### Canonical local D1 state

All local D1 tooling shares one repository-root persistence directory: `.wrangler/state`. The Cloudflare Vite plugin receives `persistState: { path: "../../.wrangler/state" }` (adjusted mechanically for workspace depth), and local Wrangler D1 migration/execute commands pass the matching `--persist-to` path. This prevents `bun db:migrate` from updating one local SQLite file while `bun dev` reads another. The Flare release harness must migrate locally and then prove the running app can read the migrated table.

### 6.2 Neon profile

Flare v1 uses **`@neondatabase/serverless` with Drizzle's `neon-serverless` driver** as the default Neon runtime profile. The WebSocket/serverless driver is chosen over `neon-http` because it supports session/interactive transactions, which is the safer baseline once Better Auth is enabled. Flare still validates the pinned Better Auth + Drizzle behavior with a deployed fixture before release. Neon's and Cloudflare's own Workers guides recommend **Hyperdrive with a native Postgres driver** (`pg`/Postgres.js) in preference to the Neon serverless driver on Workers, because Hyperdrive pools connections and avoids a fresh WebSocket per request. Flare v1 deliberately keeps the Neon serverless profile as the default because it needs no extra Cloudflare resource and keeps the v1 database contract small, but this is a **known trade-off, not an oversight**: see *Hyperdrive alternative* below for the exact switch conditions.


Use when:

- Postgres features are valuable,
- external tools need Postgres access,
- the project may outgrow D1 semantics,
- Postgres portability matters.

Generated pieces use Drizzle's Neon serverless driver and a server-side `DATABASE_URL` secret.

#### Neon Worker lifecycle

For the pinned Neon profile, database clients are created **inside the request/runtime scope**, never as module-scoped live connections. The Better Auth instance is created from that same request-scoped database access. Cleanup is scheduled **after the request handler has finished using the database**; Flare must never call `pool.end()` while returning a database handle that is still in use.

Generated code follows a scoped helper pattern such as:

```ts
// request-scoped: never keep Pool/Client as module state
export async function withDb<T>(
  env: Env,
  ctx: ExecutionContext,
  run: (db: Database) => Promise<T>,
) {
  const pool = new Pool({ connectionString: env.DATABASE_URL })
  const db = drizzle(pool)

  try {
    return await run(db)
  } finally {
    // pool.end() is invoked only after run(db) settles.
    ctx.waitUntil(pool.end())
  }
}
```

An equivalent request-context object is acceptable if the pinned Better Auth integration needs to share the same `db` for the whole request, but the lifetime invariant is fixed: **create inside the request, use it, then schedule cleanup in `finally`**. The deployed Neon fixture must make at least two consecutive requests and an auth request to catch premature cleanup or cross-request reuse.

#### Hyperdrive alternative (first post-v1 database recipe)

Flare switches the **default** Neon profile to Hyperdrive in the next minor release if the deployed Neon fixture shows connection errors, unacceptable per-request latency, or Better Auth transaction problems with the serverless driver. Switching the default is a spec decision, not a silent patch. The recipe (`flare add hyperdrive`, post-v1) has these fixed requirements:

- use a native driver (`pg` or Postgres.js) with Drizzle's matching driver, **not** `@neondatabase/serverless`,
- create the Hyperdrive configuration from Neon's **direct (non-pooled)** connection string, because Hyperdrive does its own pooling,
- declare a `hyperdrive` binding per environment in `wrangler.jsonc`; the origin connection string then lives in the Hyperdrive configuration and **no runtime `DATABASE_URL` secret** is required,
- local development supplies `localConnectionString` or `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_<BINDING>` pointing at a non-production database,
- confirm Hyperdrive availability on the account's Workers plan at setup time (Cloudflare and Neon documentation differ on plan requirements).

Flare v1 does **not** automate Neon branch creation. `flare setup cloudflare` asks for separate preview and production Neon connection URLs. This avoids adding a Neon management API credential to the base stack. A future Neon-management recipe can automate branch lifecycle later.

### 6.3 Do not support both at runtime in one generated app

Do not generate code full of:

```ts
if (provider === "d1") { ... }
else if (provider === "neon") { ... }
```

The generator should materialize the correct client and dependencies for the selected database.

That keeps application code clean.

### 6.4 Database commands

Expose the same root commands independent of the selected provider:

```bash
bun db:generate
bun db:migrate
bun db:migrate:preview
bun db:migrate:prod
bun db:studio
```

The implementation behind those scripts is provider-specific.

For D1, local and remote migrations must remain explicit so a local migration cannot accidentally mutate production. `bun db:migrate` applies to the canonical local `.wrangler/state`; `bun db:migrate:preview` applies only to the configured Preview/persistent-preview D1 resource; `bun db:migrate:prod` targets production and is never run implicitly by `bun deploy`.

---

## 7. Better Auth

Authentication is **optional**, but fully provisioned when selected.

Do not install Better Auth in projects that do not need authentication.

When auth is enabled, Flare generates the complete path rather than merely installing the npm package.

### 7.1 Default auth scope

`--auth` means a small, usable Better Auth baseline rather than every auth feature:

- email/password authentication,
- session management,
- sign in / sign up / sign out,
- protected-route helpers,
- secure production cookies and trusted origins.

Email verification, password reset, OAuth providers, organizations, 2FA, passkeys, and similar capabilities stay opt-in recipes because they introduce extra credentials, email infrastructure, or product decisions.

### 7.2 What `--auth` adds

- Better Auth server configuration
- Better Auth React client
- database schema
- Drizzle adapter configured for the selected database
- auth route/handler
- session helpers
- environment placeholders
- minimum auth UI
- route protection helpers
- migrations
- Better Auth Agent Skills
- auth-specific instructions in `AGENTS.md`

### 7.3 Database mapping

For D1:

```text
Better Auth
    ↓
Drizzle adapter
provider: sqlite
    ↓
Cloudflare D1
```

For Neon:

```text
Better Auth
    ↓
Drizzle adapter
provider: pg
    ↓
Neon Postgres
```

#### Adapter behavior is release-tested

The Neon profile supports interactive transactions through `neon-serverless`. D1 does not expose the same interactive transaction model; Flare does not invent a custom Better Auth transaction adapter in the spec. Instead, every pinned Flare release must prove the actual Better Auth + Drizzle + D1 sign-up/session flows in a Cloudflare fixture before that version ships. If an upstream adapter change breaks the flow, the version matrix is blocked until Flare adapts.

### 7.4 TanStack Start

The `app` preset uses Better Auth's TanStack Start integration and cookie helper rather than inventing a custom session bridge.

### 7.5 Fullstack

For `fullstack`, auth lives on `apps/server`. The web app consumes the generated Better Auth client.

#### Dynamic base URL: no `BETTER_AUTH_URL` in the base stack

Flare uses Better Auth's **dynamic `baseURL` allowlist** for both `app` and `fullstack`. The browser-facing request origin is already authoritative in Flare's same-origin topology, so the base stack does not maintain separate local/preview/production `BETTER_AUTH_URL` values.

```ts
const allowedHosts = env.AUTH_ALLOWED_HOSTS
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean)

export const auth = betterAuth({
  baseURL: {
    allowedHosts,
    protocol: env.AUTH_PROTOCOL, // "http" locally, "https" on Cloudflare; never "auto"
  },
  // advanced.trustedProxyHeaders is left unset/false on purpose
  // ...database, rateLimit, etc.
})
```

`AUTH_ALLOWED_HOSTS` and `AUTH_PROTOCOL` are **non-secret Wrangler vars** generated per environment. `flare setup cloudflare` resolves the account's actual Worker hostname/Preview suffix and writes the narrowest useful allowlist:

- local: the preset's explicit known dev origin(s), for example `localhost:5173` for the `fullstack` web dev server and the TanStack Start dev port for `app`. Better Auth supports port wildcards, but Flare intentionally emits the exact known development ports to keep the allowlist narrower than `localhost:*`,
- production: the exact production `workers.dev` hostname and any configured custom domain,
- persistent fullstack preview: the exact `web-preview` hostname,
- single-Worker Previews: the Worker-specific wildcard form `*-<worker-name>.<account-subdomain>.workers.dev`, which matches both the stable Preview URL and per-deployment URLs (plus any configured Preview custom-domain pattern). The alias and Worker name together must stay within the 63-character DNS label limit.

Unknown hosts fail closed; Flare does not generate a `fallback` by default. Better Auth automatically adds allowed hosts to trusted origins. Because the original public `Request` is preserved across the Service Binding, the real browser-facing host reaches the auth Worker without an internal fake hostname.

**Why `protocol` is explicit.** With `protocol: "auto"` (or unset), Better Auth decides the cookie `Secure` flag from `NODE_ENV === "production"`, which Worker bundles do not reliably provide. A deployed Worker could therefore issue session cookies without `Secure`. Flare sets `AUTH_PROTOCOL` to `http` only for local development and `https` everywhere on Cloudflare (`workers.dev` and custom domains are HTTPS-only), so the cookie flag no longer depends on an environment-mode variable.

**Forwarded headers are not trusted.** Better Auth's host derivation differs between versions (older releases read `x-forwarded-host` first; current releases ignore forwarded headers unless `advanced.trustedProxyHeaders` is enabled). Flare pins the Better Auth version, leaves `trustedProxyHeaders` off, and the release harness proves that a request carrying a spoofed `X-Forwarded-Host`/`Host` value outside the allowlist is rejected.

**Social login and Worker Previews.** GitHub OAuth Apps register one callback URL, while each Worker Preview has its own hostname. Social login therefore works on production and the persistent fullstack preview (each with its own OAuth app), but **not on per-branch Worker Previews** unless a stable Preview custom-domain pattern is registered. Email/password auth works on every Preview. This is a documented v1 limit.

### 7.6 Auth UI scope

V1 should include a minimal, replaceable set of pages/components:

- sign in
- sign up
- sign out
- protected-route example
- loading state
- auth error state

Password reset, verification email, OAuth providers, organizations, 2FA, passkeys, etc. should be later recipes rather than mandatory starter weight.

### 7.7 Rate limiting on Cloudflare

Better Auth's built-in rate limiter defaults to **in-memory storage** and is only enabled by default in production mode. In-memory counters are per-isolate and therefore useless on Workers, so Flare enables the limiter explicitly and stores counters in the database. When auth is enabled, Flare configures:

```ts
rateLimit: {
  enabled: true,            // explicit; never rely on environment-mode defaults
  storage: "database",      // durable across isolates
  window: 60,
  max: 100,
  customRules: {
    "/get-session": false,  // session checks are frequent reads; do not write a counter row for each
  },
}

advanced: {
  ipAddress: {
    ipAddressHeaders: ["cf-connecting-ip"], // Better Auth's default is x-forwarded-for
  },
}
```

Notes that shape this configuration:

- Better Auth applies the global window/max to every auth route unless a rule overrides it, and its own stricter rules (for example `/sign-in/email`, 3 requests per 10 seconds) still apply. Without the `/get-session` exemption, every page load would perform a database **write**; on D1 that burns the row-write quota quickly.
- Server-side calls made through `auth.api` are not rate limited; only client-initiated HTTP requests are.
- IPv6 clients are limited per `/64` by default, which Flare keeps.
- The `rateLimit` table is included in the generated Drizzle schema and migrations, and the release harness checks that it exists in both D1 and Neon profiles.
- The original browser `Request` is preserved across the Service Binding, so Cloudflare's `cf-connecting-ip` header reaches the auth Worker. Flare never trusts a client-supplied `x-forwarded-for` chain.
- A project that needs cheaper or faster counters can later move the limiter to Cloudflare KV as secondary storage; that is an explicit recipe, not the v1 default.

Flare's release harness verifies that repeated sign-in attempts are limited across separate Worker requests/isolate executions, and that `/get-session` performs no rate-limit write.

---

## 8. shadcn/ui integration

This is an important part of Flare rather than an afterthought.

As of 2026, the shadcn CLI can manage presets, TanStack Start templates, monorepos, agent skills, dry-run/diff workflows, and GitHub-backed registries.

### 8.1 Flare UI preset

Create one Flare design preset with `shadcn/create` and store its preset code in the Flare source repository.

Recommended initial direction:

- Base UI primitives
- neutral startup-friendly base
- Tailwind v4
- CSS variables
- Lucide icons unless another icon set is deliberately selected
- a restrained default radius/type system

Do **not** require every generated project to fetch the preset remotely at runtime.

Instead:

1. resolve the preset when cutting a Flare release,
2. commit the resulting `components.json`, theme CSS, and base UI files into the tested template,
3. retain the preset code as provenance and for easy customization.

The project can expose:

```bash
bun ui:preset
```

which prints the preset code and the command needed to open it in shadcn/create.

### 8.2 Monorepo UI layout

Web-capable presets use:

```text
apps/web/components.json
packages/ui/components.json
packages/ui/src/components/
packages/ui/src/hooks/
packages/ui/src/lib/
packages/ui/src/styles/
```

For extensions:

```text
apps/extension/components.json
packages/ui/components.json
```

The shadcn CLI understands this monorepo arrangement and can route shared components into `packages/ui`.

### 8.3 Do not preinstall 40 components

Ship a small base set only:

- Button
- Input
- Label
- Card
- Dialog
- Dropdown Menu
- Tooltip
- Skeleton
- Separator

Add product-specific components when they are actually needed.

### 8.4 Flare as a shadcn GitHub registry

Flare's own GitHub repository should contain a root `registry.json`.

That lets the repo distribute more than components. Current shadcn GitHub registries can distribute project conventions, agent instructions, workflow files, templates, feature kits, hooks, utilities, and other files.

Candidate registry items:

```text
flare/project-conventions
flare/auth-ui
flare/dashboard-shell
flare/empty-state
flare/settings-shell
flare/agent-skills-web
flare/agent-skills-cloudflare
flare/extension-ui
```

Example future usage:

```bash
bunx --bun shadcn@latest add <github-owner>/<flare-repo>/auth-ui
```

If the Flare repo remains private, current shadcn GitHub registries can also read private repositories when the developer is authenticated.

### 8.5 Why use the registry

This removes the need to build a giant plugin engine for every file-based enhancement.

Use:

- **Flare recipes** for changes that require architecture/resource/config logic,
- **shadcn registry items** for portable files, UI kits, instructions, conventions, and lightweight feature kits.


### 8.6 Design-system enforcement with `@shadcn/lint`

Every preset with a web UI installs `@shadcn/lint` as a **specialized design-system linter**.

Biome remains the general formatter/linter. Flare does **not** reintroduce a full general-purpose ESLint stack. Instead, generated web projects include a minimal `eslint.config.mjs` whose only responsibility is the shadcn design-system rules.

This is deliberate. `@shadcn/lint` currently supports ESLint and Oxlint; Oxlint's JS plugin surface is still described as alpha, so Flare v1 should prefer the more conservative ESLint integration until that changes.

**Exit condition:** remove the dedicated ESLint dependency when `@shadcn/lint` has a stable standalone runner or stable Oxlint/plugin integration with equivalent rule coverage and monorepo behavior. Biome remains the general linter throughout.

Default rules should begin strict but practical:

```text
shadcn/no-raw-colors
shadcn/no-arbitrary-values
shadcn/no-inline-styles
shadcn/no-unknown-classes
shadcn/require-static-classes
shadcn/no-restyle
```

`no-restyle` should allow layout-only classes for shared components so app code can still do things such as width, margin, grid placement, and responsive layout without repainting the design system.

Monorepo configuration points the linter at the shared package:

```text
packages/ui/src/components/**
```

The shared component implementation directory is exempt from `no-restyle` where necessary, while consumers in `apps/web` and `apps/extension` are checked against the component API and theme tokens.

Generated commands:

```bash
bun ui:lint
bun ui:lint:fix      # only where the underlying rule can safely fix
```

Quality gates become:

```text
bun check
  -> TypeScript
  -> Biome
  -> @shadcn/lint for web-capable workspaces
```

The pre-commit hook runs shadcn lint only against relevant staged UI files when possible. `bun verify` always runs the complete UI lint.

`AGENTS.md` and the web skill must tell coding agents to treat shadcn lint failures as design-system violations, not warnings to suppress. Exceptions belong in configuration with an explanation, never as ad-hoc disable comments scattered through product code.

---

## 9. Agent Skills and hidden project skills

Flare should treat Agent Skills as a core feature.

### 9.1 Canonical layout

Use the vendor-neutral hidden directory:

```text
.agents/
└── skills/
    ├── flare-project/
    │   └── SKILL.md
    ├── flare-web/
    │   └── SKILL.md
    └── ...
```

Agent Skills use progressive disclosure: the catalog metadata is cheap to expose, while the full skill is loaded only when a task matches it. This means a project can contain several useful skills without stuffing all of their instructions into every prompt.

### 9.2 `AGENTS.md` vs skills

`AGENTS.md` is for facts that nearly every task needs:

- package manager is Bun
- repo layout
- allowed architectures
- important commands
- Cloudflare runtime constraints
- how environment variables are handled
- code conventions
- typecheck/lint/build gate

Skills are for task-specific procedures:

- adding a shadcn component
- editing TanStack Start server functions
- working with D1
- working with Neon
- changing Better Auth
- deploying to Cloudflare
- adding an MCP route
- extension development

### 9.3 Default skill policy

#### Every Flare project

Install or vendor:

```text
flare-project
cloudflare / workers best-practices
```

#### Any project with a web UI

Add:

```text
shadcn official skill
flare-web
shadcn-lint guidance
```

#### `app` preset

Add TanStack Start guidance/skills.

#### Auth enabled

Add Better Auth's official skill pack.

#### D1 enabled

Add D1/Cloudflare storage guidance.

#### Extension preset

Add a Flare WXT skill with the exact conventions used by the template.

#### MCP enabled

Add an MCP/Cloudflare Agents skill appropriate to the generated implementation.

#### Server-capable presets

For `app`, `fullstack`, and `worker`, add evlog guidance covering request-wide events, structured errors, redaction, Cloudflare Workers adapters, and the project's approved log fields.

### 9.4 Prefer official skills when they exist

Current ecosystems already publish useful skills:

- shadcn publishes an official shadcn skill and an agent-oriented design-system linter,
- Cloudflare maintains a `cloudflare/skills` repository,
- Better Auth maintains `better-auth/skills`,
- TanStack repositories now ship project/library skills in parts of the ecosystem.

Flare should not duplicate large upstream reference manuals. Its own skills should document **Flare-specific decisions and integration glue**.

### 9.5 Compatibility

`.agents/skills` is the canonical project copy.

Some agents also look in vendor-specific directories such as `.claude/skills`. A `flare skills sync` command can install/copy compatible skills to the active agent's expected location without making the source repository maintain several divergent skill copies by hand.

Suggested commands:

```bash
flare skills list
flare skills sync
flare skills update
```

V1 can begin by generating `.agents/skills` plus the directories needed by the coding agents I actually use.

---

## 10. Cloudflare deployment/configuration strategy

Flare v1 uses the **stable Wrangler path by default** and treats the new `cf` CLI as experimental until it leaves open beta.

Cloudflare introduced `cf` and `cloudflare.config.ts` on 2026-09-28, but the CLI is explicitly an **open beta**. Flare should not make every generated project depend on a one-day-old beta configuration surface when Wrangler already provides the required Workers, bindings, local-development, type-generation, and deployment workflows.

### 10.1 V1 default

Generated deployable workspaces use:

```text
wrangler.jsonc
```

and the Cloudflare Vite plugin where appropriate.

Default underlying commands:

```bash
wrangler types
wrangler dev
wrangler deploy
```

Human-facing Flare commands remain stable:

```bash
bun dev
bun preview
bun deploy
```

Flare may wrap Wrangler, but the generated project should remain understandable without the Flare CLI.

#### Compatibility-date policy

Every Flare release pins a tested `compatibility_date` in generated `wrangler.jsonc`. New Flare releases may advance that date only after the release matrix passes. For compatibility dates on or after `2026-08-04`, Cloudflare enables the current Node.js compatibility behavior by date, so new Flare configs omit redundant `nodejs_compat`/`nodejs_compat_v2` flags. `flare doctor` warns and can normalize redundant flags, but does not claim they are runtime errors because current Cloudflare tooling ignores them.

The release matrix pins exact Wrangler and `@cloudflare/vite-plugin` versions. Any project using Worker Previews requires **Wrangler 4.135.0 or later**. Production/persistent-preview secret bootstrap uses `wrangler secret bulk`; because draft-Worker auto-creation is behavior of the pinned Wrangler implementation, Flare proves it with a release fixture rather than claiming an unverified historical minimum. Generated projects pin the exact Wrangler version validated by that matrix. Rather than relying on an unverified hard-coded Vite-plugin floor, each Flare release records the exact tested plugin version and proves Node-compatible dependencies plus generated Worker types on that version. `@types/node` is installed when the generated dependency graph references Node built-ins/types.

### 10.2 `cf` / `cloudflare.config.ts` is opt-in for v1

The new Cloudflare stack is worth tracking because it brings typed programmatic configuration and broader API coverage, but v1 treats it as an experiment:

```bash
flare cloudflare experimental-cf enable
```

If enabled, Flare pins the tested `cf` version for that project. The beta path must never silently replace the stable Wrangler configuration.

Every Flare release that claims compatibility with the experimental `cf` path should generate and exercise at least one fixture against the pinned version before release.

### 10.3 Generated Cloudflare types

Never hand-maintain the Worker environment type.

`bun check` should regenerate binding types before TypeScript validation, using the stable Wrangler path in v1:

```text
wrangler types
      ↓
TypeScript
      ↓
Biome
      ↓
@shadcn/lint (web presets)
```

### 10.4 Service Bindings are the fullstack default

For `fullstack`, the web Worker declares a Service Binding to the server Worker and forwards `/api/*` using `env.SERVER.fetch(request)`.

Production web binding:

```jsonc
{
  "services": [
    {
      "binding": "SERVER",
      "service": "my-app-server"
    }
  ]
}
```

The server Worker is internal by default:

```jsonc
{
  "name": "my-app-server",
  "workers_dev": false,
  "preview_urls": false
  // no public route
}
```

Benefits:

- no public backend URL for first-party traffic,
- first-party Better Auth cookies,
- no browser CORS on the normal app path,
- independently deployable codebases,
- no Internet round trip between Workers.

**Preview warning:** Cloudflare Worker Previews currently do not resolve a Service Binding to a matching Preview of the downstream Worker; the binding reaches the downstream Worker's production deployment. Flare therefore does not use branch Worker Previews for the `fullstack` topology in v1. See §12.2.

### 10.5 Stable abstraction boundary

Application code must not depend directly on whether Flare internally uses Wrangler or a future stable `cf` release for deployment automation.

The public contract remains:

```bash
bun deploy
```

When `cf` becomes sufficiently stable, Flare can migrate its implementation without changing the everyday project workflow.



Generated projects pin `flare` as an **exact devDependency**; production commands never depend on a globally installed Flare CLI. The repository remains understandable without Flare knowledge: `wrangler.jsonc` owns concrete Cloudflare deployment configuration, package scripts expose low-level provider operations, and `flare` is the orchestration/validation layer rather than a proprietary runtime.

## 11. Observability and logging with evlog

Flare standardizes server-side application logging on **evlog** for the presets that execute server code:

```text
app       -> yes
fullstack -> yes
worker    -> yes
extension -> browser code excluded; the v1 extension preset has no server workspace
```

The objective is not to create a custom Flare logging framework. Flare should configure evlog correctly and let Cloudflare Workers Logs or an explicitly configured drain remain the destination.

### 11.1 Default behavior

Development uses readable pretty output. Production emits structured JSON so Cloudflare can index individual fields rather than treating every event as an opaque string.

Each server-capable project gets a small shared observability module, preferably:

```text
packages/observability/
├── src/
│   ├── index.ts
│   ├── fields.ts
│   └── redact.ts
└── package.json
```

For a single-worker project this package may be inlined if doing so is materially simpler; generated application code must still use the same conventions.

### 11.2 Request-wide events

HTTP handlers should prefer one useful wide event per request/operation instead of many unrelated `console.log` statements.

A request event should accumulate only useful debugging context such as:

```text
requestId
method
path
status
userId            # only when appropriate
operation
resourceId
outcome
durationMs
```

Do not log credentials, raw session tokens, authorization headers, payment secrets, or unnecessary personal data.

### 11.3 Cloudflare Workers integration

Worker-based entrypoints use evlog's Workers adapter so platform severity is preserved and asynchronous drains can be registered with the request lifecycle/`waitUntil` correctly.

Flare must not hide Cloudflare's native observability. The path is:

```text
application
   -> evlog structured event
   -> console / drain
   -> Cloudflare Workers Logs
   -> optional external drain later
```

Cloudflare recommends structured JSON for Workers Logs because fields can be extracted and queried individually. That aligns with evlog's production mode.


Generated server-capable `wrangler.jsonc` files explicitly enable Workers Logs:

```jsonc
{
  "observability": { "enabled": true }
}
```

For `fullstack`, the public web Worker creates or preserves a request ID (prefer `cf-ray`/an existing request ID when appropriate, otherwise a generated ID), forwards it across the Service Binding, and the server includes the same ID in its evlog event. The web forwarding layer does **not** emit a second full request event for every successful `/api/*` request; it logs only proxy-specific failures/metadata needed to debug the hop. This avoids duplicate uncorrelated request logs.

### 11.4 Structured errors

Flare code should use structured errors for failures where developers or agents benefit from explicit context such as:

```text
what happened
why it happened
how to fix it
safe metadata
```

The logging layer must redact sensitive values before emission.

### 11.5 Commands

Expose stable Flare commands rather than requiring developers to remember provider-specific observability commands:

```bash
flare logs
flare tail
flare doctor observability
```

`flare logs` and `flare tail` may wrap Cloudflare-native tooling. They do not create a second log store.

### 11.6 Agent policy

The generated `AGENTS.md`/skill guidance should state:

- do not introduce random `console.log` calls in server code,
- enrich the current request/operation logger when possible,
- emit structured fields, not concatenated strings,
- never log secrets,
- use the shared redaction helpers,
- preserve one useful wide event per important request/job.

---

## 12. Deployment model: no GitHub Actions required

Flare-generated projects should **not** include GitHub Actions by default.

The deployment philosophy is:

```text
local development
    ↓
Git hooks validate the change
    ↓
commit / push
    ↓
either:
  A. deploy directly from the developer machine
  B. let Cloudflare build/deploy the production branch
```

Cloudflare is the deployment runner. GitHub is only the source repository unless I deliberately add another CI system later.

### 12.1 Two supported production paths

Every deployable Flare project supports both paths.

#### Path A — direct local deployment

From the project root:

```bash
bun deploy
```

Flare runs the production quality gate and deploys directly from the current machine.

```text
bun deploy
   ↓
flare deploy
   ↓
bun run verify
   ├── typecheck
   ├── Biome + @shadcn/lint
   └── production build
   ↓
Cloudflare deploy
   ↓
production
```

Flare v1 uses the pinned Wrangler version as the deployment engine. The experimental `cf` path is opt-in and never required for a normal Flare project.

The human-facing command stays:

```bash
bun deploy
```

This path is useful when I am working alone, want to ship immediately, do not want to connect a repository to Cloudflare Builds, or want exact control over when production changes.

`flare doctor` should verify Cloudflare authentication before the developer reaches the end of the deployment flow.

#### Path B — Cloudflare Git-connected deployment

A Worker can be connected directly to GitHub/GitLab using **Cloudflare Workers Builds**.

No GitHub Actions workflow is required.

Recommended branch model:

```text
feature/* ───────┐
fix/* ───────────┼── merge ──> main
experiment/* ────┘              │
                                ▼
                    Cloudflare Workers Builds
                                │
                         verify + build
                                │
                              deploy
                                │
                           production
```

Default production branch:

```text
main
```

Flare should allow this to be changed to `production` or another branch in project configuration.

A push to the configured production branch causes Cloudflare to execute the project's build command and then its deploy command.

Recommended Cloudflare build settings for single-deployable presets:

```text
Build command:
bun run verify

Deploy command:
bun run deploy:cloudflare
```

For `fullstack`, connect **only the public web Worker** to Workers Builds. Its production trigger runs `bun check` as the build command, then the deploy command performs the migration preflight, the single production Vite build, the private server deploy, and finally the web deploy. Do not connect web and server as two independent production build triggers because their deploys can race.

Where:

```text
verify
→ typecheck + lint/format check + build

deploy:cloudflare
→ pinned Wrangler deploy
```

This avoids duplicating the same pipeline in `.github/workflows`.

### 12.2 Preview strategy is topology-aware

Flare supports remote preview environments, but **single-Worker presets and multi-Worker fullstack projects use different mechanisms**. Preview configuration is explicit; it never inherits production mutable resources by accident.

#### `app` and standalone `worker`

These presets may use Cloudflare Worker Previews directly. Any mutable binding used by a Preview must be declared in the Wrangler `previews` block and point at a preview-only resource. Production D1/R2/KV bindings are never assumed to carry over.

```jsonc
{
  "d1_databases": [
    { "binding": "DB", "database_name": "my-app-production", "database_id": "<production-id>" }
  ],
  "previews": {
    "d1_databases": [
      { "binding": "DB", "database_name": "my-app-preview", "database_id": "<preview-id>" }
    ]
  }
}
```

The release harness must prove that an `app + D1` or `worker + D1` Preview writes only to the preview database. The same rule applies to R2, KV, and other mutable bindings.

**Worker Preview secrets use Wrangler's Preview secret APIs, not `wrangler deploy --secrets-file`.** `flare secrets push --env preview` is topology-aware for `app` and standalone `worker`: it validates the gitignored `.preview.vars` file against `secrets.required`, then uploads the declared names to the Worker's **Previews Base configuration** with `wrangler preview base-config secret bulk`. Every newly created Preview receives those base secrets. If a developer intentionally needs a one-Preview override, Flare may use `wrangler preview secret bulk <file> --name <preview>` explicitly.

Worker Preview `previews` configuration is **required** by Wrangler even when a Worker has no separate Preview bindings, so Flare always generates at least `"previews": {}` for `app` and standalone `worker`. The Preview Base secret commands need Wrangler 4.121.0 or later; the Worker Preview floor of 4.135.0 already covers it.

`bun preview` itself runs `wrangler preview` after checking that the required Preview Base secret names exist; it does **not** pass `--secrets-file`, because `wrangler preview` has no such option. Cloudflare documents that later changes to Preview Base secrets apply only to newly created Previews, so `flare secrets push --env preview` prints that behavior and offers the exact per-Preview override command when an already-active Preview must change immediately.

Because Wrangler has an open report that redeploying to an existing named Preview can drop its secrets, `bun preview` also **verifies after every deploy**: it runs `wrangler preview secret list --name <preview>` (values are masked), compares the listed names with `secrets.required`, and if any are missing applies them once with `wrangler preview secret bulk <temporary-file> --name <preview>` from `.preview.vars` (a restricted temporary copy, deleted immediately), then re-lists. If names are still missing the command fails loudly instead of leaving a half-configured Preview. The re-apply creates a new Preview deployment that goes live immediately, which is acceptable for a disposable Preview.

#### `fullstack`

Cloudflare currently routes a Service Binding from a Worker Preview to the downstream Worker's **production deployment**, not to a matching downstream Preview. Using normal branch Worker Previews for Flare fullstack would therefore risk preview traffic reaching production server code/resources.

Flare v1 avoids that entire class of failure by using a **persistent Wrangler `preview` environment** for both Workers:

```text
my-app-web-preview
       │
       │ Service Binding
       ▼
my-app-server-preview
       │
       └── preview-only D1 / Neon / R2 / KV resources
```

The Cloudflare Vite plugin builds **both** the public web Worker and the auxiliary server Worker from the same pinned build graph. Environment selection happens at build time. This removes the previous split where development/build used Vite for the server but production bundled it separately with plain Wrangler.

`bun preview` for `fullstack` performs:

```text
verify preview configuration
        ↓
apply preview DB migrations
        ↓
CLOUDFLARE_ENV=preview vite build   # from apps/web
        ↓
deploy generated auxiliary server config
        ↓
deploy generated entry/web config
        ↓
health-check the public web-preview URL and /api/health
```

The Vite build emits each auxiliary Worker into its own `dist` subdirectory. Flare's deploy script locates the generated server Wrangler config by reading each generated `dist/*/wrangler.json` and matching its `name` field to the expected server Worker name (never by assuming the output directory name) and runs `wrangler deploy -c <generated-server-config>` before running `wrangler deploy` from `apps/web`, where `.wrangler/deploy/config.json` redirects Wrangler to the generated flattened **web** config. Only the entry Worker is deployed by the ordinary redirected `wrangler deploy`, so the auxiliary server must be deployed explicitly first.

The web preview binding in `env.preview.services` explicitly targets `my-app-server-preview`. Flare's release harness inspects the generated configs and confirms the preview Service Binding survives the build unchanged.

Rules:

- production web binds production server,
- preview web binds preview server,
- preview server binds only preview mutable resources,
- `bun preview` automatically applies **preview-only** migrations before deploying code; preview databases are disposable and may advance automatically,
- preview and production secrets are configured independently; because fullstack preview is a persistent Wrangler `env.preview` Worker rather than a Worker Preview, `flare secrets push --env preview` runs `wrangler secret bulk <file> --name <server-preview-worker-name>` with the explicit Worker name **before the first deploy and for later updates**. Current pinned Wrangler can create a draft Worker when that Worker does not yet exist, so no first-preview `--secrets-file` path is needed. The generated Vite config is flattened and must not be relied on to select the preview environment for secret commands (the web Worker declares no required secrets),
- preview cleanup never touches production,
- automatic branch Worker Previews are **disabled for `fullstack` v1**,
- `flare setup cloudflare` explicitly instructs the user to disable Preview Builds/non-production branch builds for the connected web Worker; `flare doctor` verifies the setting when Cloudflare exposes it through the API available to the pinned toolchain,
- as a code-level backstop, the connected Worker's **Preview/non-production deploy command** is `bun run cloudflare:branch-preview-guard`; it prints `Fullstack branch Previews are disabled; run bun preview` and exits successfully **without uploading a Worker**, so a forgotten dashboard toggle cannot create a branch Preview bound to production,
- the connected web Worker uses the **repository root** and no narrowed watch paths by default, so server-only/type-only changes still trigger the ordered deployment,
- the persistent v1 preview pair is shared: concurrent feature branches can overwrite the same preview environment. This is a documented v1 limitation, not branch isolation.

Preview URLs can be publicly reachable. Flare therefore emits `X-Robots-Tag: noindex, nofollow` for preview environments and documents Cloudflare Access as the recommended protection when preview data or functionality should not be public. Access remains opt-in in v1 to keep the 15-minute first-deploy path small.

### 12.3 Git hooks are the local quality gate

Because generated projects do not rely on GitHub Actions, Flare installs repository-controlled Git hooks with **Lefthook**.

The default hook mode must stay fast enough that developers do not immediately reach for `--no-verify`.

Recommended behavior:

```text
git commit
   ↓
pre-commit
   ├── Biome only on staged files
   └── @shadcn/lint / ESLint only on relevant staged UI files
   ↓
commit accepted
```

TypeScript is deliberately **not** in the default pre-commit hook because a full monorepo typecheck is not a fast staged-file operation.

Then:

```text
git push
   ↓
pre-push
   └── bun check
         ├── full typecheck
         └── full Biome + @shadcn/lint validation
```

Example `lefthook.yml` shape:

```yaml
pre-commit:
  parallel: true
  commands:
    biome:
      run: bunx biome check --staged
    ui-lint:
      run: bun run ui:lint:staged -- {staged_files}

pre-push:
  commands:
    check:
      run: bun check
```

`ui:lint:staged` should filter the staged paths to the web/UI files that the specialized shadcn rules understand; it must not run `eslint .` over the whole monorepo on every commit.

For projects where I explicitly want the complete quality gate before every commit, Flare may expose:

```text
gitHooks.mode = "strict"
```

Default:

```text
pre-commit → staged/fast gate
pre-push   → full static/type gate
build      → deploy/Cloudflare gate
```

A strict hook mode may use `bun run verify` on pre-push for projects where the developer explicitly prefers a production build before every push.

### 12.4 Cloudflare is the final production-build gate

Git hooks can be skipped, so deployment always runs the complete production verification.

Single-deployable presets use:

```text
Build command:
  bun run verify

Deploy command:
  bun run deploy:cloudflare
```

For `fullstack`, only the **web Worker** is connected to the repository's production Workers Build. Use the repository root as the build root and configure:

```text
Build command:
  bun check

Deploy command:
  bun run deploy:cloudflare
```

The build step performs the fast repository-wide type/lint/design-system gate. `bun run deploy:cloudflare` then performs the **single** production Vite build used for both Workers, so Workers Builds does not compile the fullstack project twice.

`bun run deploy:cloudflare` does not rerun `bun check`. It first asserts that `CLOUDFLARE_ENV` is **unset** for production and, when running inside Workers Builds, that `WORKERS_CI_BRANCH` equals the `productionBranch` recorded in `flare.config.ts` (refusing to deploy otherwise, because Workers Builds exposes the pushed branch in that variable), builds from `apps/web`, reads the Vite-generated redirected deploy config, and verifies that its Worker name matches the expected production name. It then performs the database migration preflight once and deploys in order:

```text
assert production environment
      ↓
build web + auxiliary server once
      ↓
deploy generated server Worker
      ↓
deploy generated web Worker
      ↓
health-check public web origin + /api/health
```

This avoids two independent Workers Builds racing each other and guarantees the server exists before the web Worker updates its Service Binding. The connected web Worker uses the repository root and does **not** narrow watch paths in v1, because a server-only or shared-contract change can require a coordinated redeploy. Preview/non-production branch builds are disabled for this connected Worker.

The generated repository has no root `prepare` hook installer, so Cloudflare dependency installation cannot accidentally run `lefthook install`. `bun setup` owns local hook installation.

Because `apps/web` imports the Hono app type from `apps/server`, the web workspace declares the server workspace as an explicit **type-only workspace dependency**. Turborepo can therefore include the server/shared dependency graph naturally when building/verifying web code. Flare's release harness includes a contract-change fixture: change a server RPC type without updating web usage and assert `bun check` fails.

### 12.5 Root deployment commands

All deployable presets should expose:

```bash
bun dev
bun check
bun run build
bun run verify
bun preview
bun deploy
flare logs
flare rollback
```

Recommended meanings:

| Command | Purpose |
|---|---|
| `bun dev` | local development; warns once if Lefthook is not installed; fullstack starts only `./apps/web` because Vite owns the auxiliary server Worker |
| `bun check` | TypeScript + Biome + UI/design checks |
| `bun run build` | production build; always use `bun run build`, never bare `bun build` |
| `bun run verify` | `check` + production build |
| `bun preview` | create/update the safe remote preview model for the selected preset |
| `bun deploy` | verify and deploy production from this machine |
| `bun run deploy:cloudflare` | low-level Wrangler deploy used by Flare/Cloudflare Builds |

**Bun command collision rule:** package scripts whose names collide with Bun built-ins must always be invoked through `bun run`. In particular, `bun build` invokes Bun's built-in bundler rather than the project's `build` package script, so Flare documentation and generated automation must use `bun run build`.

Example root scripts:

```json
{
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "typecheck": "turbo run typecheck",
    "lint": "biome check .",
    "ui:lint": "eslint . --max-warnings=0",
    "ui:lint:staged": "node scripts/ui-lint-staged.mjs",
    "format": "biome format --write .",
    "check": "bun run typecheck && bun run lint && bun run ui:lint",
    "verify": "bun run check && bun run build",
    "preview": "flare preview",
    "deploy": "flare deploy",
    "deploy:cloudflare": "flare deploy --cloudflare-only"
  }
}
```

For `fullstack`, the root overrides `dev` with `turbo run dev --filter=./apps/web` and generates ordered low-level scripts such as `build:cloudflare`, `deploy:server:cloudflare`, `deploy:web:cloudflare`, `deploy:preview`, and `cloudflare:branch-preview-guard`. `build:cloudflare` runs the single Vite build from `apps/web`; `deploy:server:cloudflare` deploys the generated auxiliary Worker config; `deploy:web:cloudflare` then runs `wrangler deploy` from `apps/web` so the Vite redirect config is honored. These are orchestration internals; the human-facing commands remain `bun preview` and `bun deploy`.

Flare does **not** use a root `prepare` script to install Lefthook. `bun setup` installs hooks explicitly on developer machines. Because hook installation is not tied to package installation, Cloudflare Builds has no Git-hook side effect to suppress. `bun dev` and `flare doctor` emit a one-line warning when the repository's Lefthook hooks are not installed.


### 12.6 First-deploy bootstrap

A fresh Cloudflare account must not dead-end on required-secret validation or the migration preflight. Flare provisions data resources before application deployment and pushes required production secrets **before** the first real code deploy.

Current pinned Wrangler's `secret put` / `secret bulk` path can create a minimal draft Worker when the named Worker does not yet exist and then attach the secrets. Flare relies on the **bulk** path and release-tests that behavior on every pinned Wrangler version.

For a database-backed project, the first production release has exactly these owners:

- **`flare setup cloudflare`** performs authenticate → provision production/preview resources → write concrete resource IDs → collect/generate required secret values → push them immediately with `wrangler secret bulk` to the explicit production Worker name → apply production migrations after an explicit confirmation that shows the target database → offer the first deploy.
- Secret values are kept in process memory while the command runs and are streamed to Wrangler via stdin (or an OS-restricted ephemeral file only if the pinned Wrangler/runtime requires it). Flare does **not** create a resumable plaintext production-secret file in the repository.
- **`bun deploy`** performs the migration preflight → production build → ordered deploy → health-check sequence. If required production secrets are missing, it fails before deploy and prints `flare secrets push --env production` as the remediation.

The full sequence is:

```text
authenticate Cloudflare
  ↓
create/resolve production + preview mutable resources
  ↓
write concrete resource IDs/bindings to wrangler.jsonc
  ↓
collect/generate required production secret values
  ↓
wrangler secret bulk → explicit production Worker name
  ↓
apply production database migrations
  ↓
build the application
  ↓
deploy Worker(s) in required order
  ↓
health checks
```

For D1, `flare setup cloudflare` explicitly creates or resolves the production and preview databases before migration; it does not depend on deploy-time automatic provisioning for the first migration. For Neon, the user supplies already-created preview and production connection URLs in v1.

For `fullstack`, the **server Worker owns production secrets**. `flare secrets push --env production` targets that server Worker explicitly before its first deployment; current pinned Wrangler may create the draft Worker as part of the secret-bulk operation. The web Worker is deployed second and declares no auth/database secrets.

`flare doctor` detects required-secret names that are not configured remotely and prints the exact `flare secrets push --env <environment>` remediation. Flare never prints secret values. Secret bulk updates are additive unless an explicit JSON `null` deletion is requested.

A fresh database with zero applied migrations is treated as **pending**, and the preflight prints the exact migration command.

Preview deployment always applies `bun db:migrate:preview` first. Preview migrations are allowed to run automatically because preview data is isolated/disposable; production migrations remain explicit.

### 12.7 Database migrations during deployment

Production database migrations should **not** silently execute on every application deploy, but production code also must not deploy against an older schema by accident.

Flare therefore uses an explicit-migration + mandatory-preflight model.

Default policy:

```text
migration execution  → explicit human/release action
migration status     → mandatory deployment check
code deploy          → blocked while required migrations are pending
```

Expose:

```bash
bun db:migrate
bun db:migrate:preview
bun db:migrate:prod
flare db status --env production
```

For D1, the status command can use Cloudflare's migration metadata/listing to detect unapplied remote migrations. For Neon/Drizzle, Flare compares the generated migration set/version with the migration state recorded in the production database.

Before code is deployed, `flare deploy` and Git-connected Cloudflare builds run a **remote migration preflight** when the project has a database. If required migrations are pending, deployment stops with the exact command needed to apply them.

Build/deploy credentials are explicit:

- D1 preflight requires the Cloudflare build token/account credentials to have the D1 read access needed to inspect migration state.
- Neon preflight uses a dedicated read-only status connection where possible (for example `MIGRATION_STATUS_DATABASE_URL`) rather than exposing the application's full production database credential to the build environment merely to read migration state.
- `flare setup cloudflare` validates these prerequisites before enabling Git-connected production deploys.

Pending migration SQL is also scanned conservatively for destructive operations such as `DROP` and `RENAME`. `bun db:migrate:prod` refuses destructive migrations by default and requires an explicit `--allow-destructive` acknowledgement. The scan is a guardrail, not a substitute for reviewing migrations.

For Neon, the deploy preflight uses a dedicated **Workers Builds build secret** such as `MIGRATION_STATUS_DATABASE_URL`, preferably backed by a read-only database role. It is **not** a Worker runtime secret, does not appear in `secrets.required`, and is not written to `.dev.vars`. `flare setup cloudflare` configures/document this build-only credential separately. Preview and production runtime `DATABASE_URL` values remain independent Worker secrets. Flare v1 accepts manually supplied Neon preview/production URLs and does not require a Neon management API token.

Safe release flow:

```text
bun run verify
      ↓
bun db:migrate:prod
      ↓
flare db status --env production
      ↓
bun deploy  OR  merge → main
      ↓
new code deploys only after schema is current
```

For schema changes that cannot be deployed atomically, Flare documents **expand/contract** as the default production strategy:

1. expand the schema in a backward-compatible migration,
2. deploy code that can work with old/new data as necessary,
3. backfill if required,
4. remove old columns/constraints in a later release.

A future `flare release --with-migrations` command may orchestrate this, but v1 keeps migration execution explicit while making forgotten migrations impossible to ignore.

### 12.8 Deployment by preset

#### `app`

One Cloudflare deployment:

```text
apps/web
  ↓
TanStack Start Worker
  ↓
Cloudflare
```

Both local `bun deploy` and Git-connected Cloudflare Builds are supported.

#### `fullstack`

Two deployable Workers, one public browser origin:

```text
apps/server  → private/internal Hono Worker
                   ▲
                   │ Service Binding
apps/web     → public Web Worker → app.example.com
```

`bun deploy` verifies the repository once, deploys the server Worker first, then deploys/updates the web Worker and its Service Binding.

For Git-connected production deployment, only the **web Worker** owns the repository build trigger. Its custom deploy command deploys the server first and the web Worker second, preserving the same order as local `bun deploy` and avoiding independent-build races.

Fullstack rollback is also ordered. Every coordinated deploy generates a release ID (for example the Git commit SHA or Flare release UUID) and passes the same `--tag flare:<release-id>` / deployment message to both Worker versions. `flare deployments` reads both Workers' version metadata and pairs versions by this release ID. `flare rollback` selects a previously recorded pair, rolls back the **web Worker first**, then the server Worker, and never automatically rolls back database migrations. Expand/contract is what keeps the selected pair compatible with the current schema. Cloudflare retains only a limited window of Worker versions; if either half of a recorded pair is no longer retained, `flare rollback` refuses and says which version is gone rather than mixing a retained version with a mismatched partner.

The private server Worker sets `workers_dev: false`, `preview_urls: false`, and no public route in production. The web Worker is the first-party browser entrypoint and forwards `/api/*` through the Service Binding. A public server route/domain is optional and disabled unless a capability explicitly requires external access.

#### `worker`

One Worker deployment.

```bash
bun deploy
```

#### `extension`

The v1 `extension` preset has no Cloudflare backend and is not deployed with `bun deploy`.

Expose:

```bash
bun run build
bun package
```

for the browser-extension artifact. A backend is a separate `worker`/`fullstack` Flare project in v1.


### 12.9 Post-deployment health verification

A successful upload is not the same thing as a healthy deployment. After `bun deploy`, Flare should optionally run a small health verification against the deployment URL.

For server-capable projects this should include `/health`. For `fullstack`, the public check must hit both the root document and **`/api/health` through the web Worker**, proving the Service Binding path rather than a private server URL. When auth/database capabilities are enabled, release tests may exercise one safe read-only path.

Because fullstack deploys the server before the web Worker, server/API changes must remain backward-compatible with the currently deployed web client for at least one release step. Database changes follow the same expand/contract discipline. A failed post-deploy health check can trigger/offer rollback, but it cannot make an already-promoted server version retroactively atomic.

The health-check step must never perform destructive writes or production migrations. If it fails, Flare prints the deployment ID/URL plus the exact failing check and leaves rollback available.

The public health response is intentionally minimal: `{ "ok": true }`. It must not expose schema versions, migration IDs, dependency versions, secret state, or other operational detail. Schema/migration state belongs in `flare db status`, `flare doctor`, deployment logs, and the pre-deploy guard.

### 12.10 Deployment setup command

The one remote-provisioning command is:

```bash
flare setup cloudflare
```

`bun setup` is reserved for local bootstrap after clone. Flare does not generate a competing `bun setup:cloudflare` alias. `flare setup cloudflare` removes dashboard scavenger hunts.

It should:

- verify Cloudflare authentication,
- resolve/create the Worker(s),
- provision supported resources where safe,
- configure/resolve D1/R2/etc. bindings,
- regenerate Cloudflare types,
- validate production environment requirements,
- print the production Worker URLs,
- optionally guide the developer through connecting the Git repository to Workers Builds,
- print the exact build/deploy commands Cloudflare should use,
- configure Workers Builds through the API only where the pinned toolchain supports it; otherwise print the exact dashboard values: production branch, **Builds for non-production branches** (off for `fullstack`, or the guard command as the non-production deploy command), repository-root build directory, build/deploy commands, and the build-only `MIGRATION_STATUS_DATABASE_URL` secret for Neon,
- create `.preview.vars` from `.preview.vars.example` with preview-specific generated secrets (for example `BETTER_AUTH_SECRET`) and prompts for values that cannot be generated.

V1 does not need to automate every account-level dashboard action. When an operation cannot yet be done reliably through the pinned Cloudflare CLI/API, Flare should print the exact dashboard location and required values.

### 12.11 Recommended default workflow

```text
create project
   ↓
bun dev
   ↓
work on feature branch
   ↓
git commit
   └── pre-commit staged quality gate
   ↓
git push
   └── pre-push bun check
   ↓
optional bun preview
   ↓
merge to main
   ↓
Cloudflare Workers Builds
   ├── bun run verify
   └── bun deploy:cloudflare
   ↓
production
```

At any time I can deploy directly from my machine:

```bash
bun deploy
```

That direct path is a supported first-class workflow, not an emergency workaround.

---

## 13. Environment and secrets system

Environment setup is one of the main problems Flare exists to solve. The generated repository must make required configuration obvious without creating empty env files that the project does not need.

### 13.1 Core rules

1. **Generate env/example files only when a selected preset or capability requires them.** A plain project with no environment variables gets no placeholder env file.
2. **Never commit real secrets.** Local secret files are gitignored; only example files and secret names are committed.
3. **For Cloudflare server runtime values, prefer `.dev.vars` over `.env`.** Do not generate both in the same Worker app. Cloudflare treats `.dev.vars` as the local secret/value source and ignores `.env` values for the Worker environment when `.dev.vars` exists.
4. **Client-visible variables and server-only secrets are separate concepts.** A secret must never use a client-exposed prefix such as `VITE_`, `PUBLIC_`, or an extension-equivalent public prefix.
5. **Non-secret stable runtime configuration belongs in typed Cloudflare configuration when practical.** Secrets remain encrypted Cloudflare secrets in production.
6. **Every generated variable gets a useful comment** describing what it is, where to obtain it, and how to generate it when generation is possible.
7. **Local defaults are filled automatically when safe.** `bun setup` may create local files, derive local URLs, and generate random local secrets. It must not invent third-party API credentials.
8. **Production secrets are never silently copied from local development.** Production secret creation/push requires an explicit Flare command/action.
9. **`CLOUDFLARE_ENV` is not stored in generated `.env`/`.dev.vars` files.** Production uses the top-level Wrangler environment and requires `CLOUDFLARE_ENV` to be unset. Preview scripts set it explicitly for the command invocation only. `flare doctor` warns if the shell/build configuration leaks `CLOUDFLARE_ENV` into production.
10. **Required Cloudflare secret names are declared in Cloudflare config** so local development, deployment validation, and generated Worker types know which secrets exist. Once `secrets.required` is present, only those keys are loaded from `.dev.vars`; therefore non-secret values such as `AUTH_ALLOWED_HOSTS`, public OAuth client IDs, feature flags, and stable origins belong in per-environment Wrangler `vars`, not alongside secrets in `.dev.vars`. Secret lists and values are environment-specific and do not inherit from production to preview.
10. **`flare env check` and `flare doctor` explain the fix**, not merely the missing key.

### 13.2 File convention by project shape

#### `app` (TanStack Start on Cloudflare)

If no secret or external configuration is required, generate no env file.

When server-side values are required:

```text
apps/web/
├── .dev.vars.example      # committed
├── .dev.vars              # local only, gitignored, created by `bun setup`
└── src/env/
    ├── server.ts
    └── client.ts          # generated only if client-visible variables exist
```

A same-origin Flare app should not generate `VITE_API_URL` by default. The application already knows its own origin.

If a client-only integration later needs public build variables, Flare may add `.env.example`, but it must avoid duplicating the same variable in `.dev.vars`.

#### `fullstack`

```text
apps/web/
└── .env.example           # only when public/client build variables are required

apps/server/
├── .dev.vars.example      # committed server secrets/runtime values
├── .dev.vars              # local only, gitignored
└── src/env.ts
```

The default same-origin/local proxy setup should avoid requiring a web API URL variable unless deployment topology actually needs one.

#### `worker`

```text
apps/server/
├── .dev.vars.example      # only when required
├── .dev.vars              # local only
└── src/env.ts
```

#### `extension`

Generate `.env.example` only when the extension needs external/public configuration. The v1 extension preset has no server workspace; any secret-bearing backend belongs in a separate `worker`/`fullstack` Flare project, never in the extension bundle.

### 13.3 Example files are documentation

Example files are deliberately commented and actionable. When `secrets.required` is used, `.dev.vars.example` contains **only secrets**:

```dotenv
# Better Auth encryption/signing secret. Must be at least 32 high-entropy characters.
# `bun setup` generates a local value automatically.
# Manual alternative: openssl rand -base64 32
# Better Auth also provides: npx auth@latest secret
BETTER_AUTH_SECRET=
```

Better Auth itself documents high-entropy secrets; Flare keeps the generation hint in the example while `bun setup` handles the normal local path.

When Neon is selected, the server secret example also includes:

```dotenv
# Neon/Postgres connection string for the DEVELOPMENT database/branch.
# Never paste the production connection string into this local file.
DATABASE_URL=
```

When a GitHub OAuth recipe is added, the secret example contains only:

```dotenv
# GitHub OAuth client secret.
# Callback path: /api/auth/callback/github on each allowed public auth origin
GITHUB_CLIENT_SECRET=
```

Non-secret values such as `AUTH_ALLOWED_HOSTS` and `GITHUB_CLIENT_ID` belong in Wrangler `vars`, not `.dev.vars`. For `fullstack`, server secrets/examples live under `apps/server`.

### 13.4 Non-secret runtime values use Wrangler `vars`

Better Auth uses the dynamic host allowlist described in §7.5 instead of `BETTER_AUTH_URL`. Example fullstack server configuration after `flare setup cloudflare` resolves the account hostname:

```jsonc
{
  "vars": {
    "AUTH_ALLOWED_HOSTS": "my-app-web.my-subdomain.workers.dev",
    "AUTH_PROTOCOL": "https",
    "GITHUB_CLIENT_ID": "github-client-id"
  },
  "env": {
    "development": {
      "vars": {
        "AUTH_ALLOWED_HOSTS": "localhost:5173",
        "AUTH_PROTOCOL": "http",
        "GITHUB_CLIENT_ID": "github-local-client-id"
      }
    },
    "preview": {
      "vars": {
        "AUTH_ALLOWED_HOSTS": "my-app-web-preview.my-subdomain.workers.dev",
        "AUTH_PROTOCOL": "https",
        "GITHUB_CLIENT_ID": "github-preview-client-id"
      }
    }
  }
}
```

**Local values use a dedicated Wrangler `development` environment.** The committed top-level `vars` describe production, and `.dev.vars` cannot override non-secret `vars` once `secrets.required` is declared, so local development selects `env.development`: `bun dev` runs the Vite dev server with `CLOUDFLARE_ENV=development` (set inline by the script; Bun's package-script shell handles this on Windows, macOS and Linux). This applies to **development only**; the production rule that `CLOUDFLARE_ENV` must be unset applies to build/deploy scripts, which never inherit it from `bun dev`. Flare generates `env.development` for every Worker with `AUTH_ALLOWED_HOSTS=localhost:<port>` and `AUTH_PROTOCOL=http`. Wrangler environments do not inherit bindings, `vars`, or `secrets.required`, so the generator writes the development, preview, and production blocks from one template and `flare doctor` verifies they stay in parity. The release harness must prove that `env.development` is honored by the auxiliary server Worker under the pinned Vite plugin; a plugin version that cannot do this is not released.

For a single-Worker preset that uses Worker Previews, the Preview Base var includes the Worker-specific hostname pattern resolved from Cloudflare's preview URL suffix, for example `*-my-app.my-subdomain.workers.dev`. Custom domains are appended only when explicitly configured.

Flare recipes own these comments/config entries and update them idempotently.

### 13.5 D1 is a binding, not a fake URL

D1 projects do **not** generate `DATABASE_URL`. The database is accessed through a typed Cloudflare binding declared in `wrangler.jsonc`.

Production example:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "my-app-production",
      "database_id": "<production-d1-id>"
    }
  ]
}
```

A fullstack preview environment uses a distinct database and binding target:

```jsonc
{
  "env": {
    "preview": {
      "d1_databases": [
        {
          "binding": "DB",
          "database_name": "my-app-preview",
          "database_id": "<preview-d1-id>"
        }
      ]
    }
  }
}
```

Flare provisions/records the actual IDs and refuses to treat the production ID as the preview default.

### 13.6 Required Cloudflare secrets

Pinned Wrangler versions used by Flare v1 support required secret declarations. Flare commits only secret **names**:

```jsonc
{
  "secrets": {
    "required": ["BETTER_AUTH_SECRET"]
  }
}
```

Wrangler uses this declaration for local/deploy validation and generated binding types. Secret values remain in `.dev.vars` locally and Cloudflare Secrets remotely.

`flare env check` still reads Flare's manifest/env schema and provides the richer project-specific error messages, setup hints, and environment checks that Wrangler alone cannot know about.

Required-secret behavior is part of the setup contract:

- only actual secrets are listed in `secrets.required`,
- local `.dev.vars` contains only those secret values for that Worker,
- preview and production each receive their own required secret values,
- `wrangler deploy` is expected to fail before upload when a required secret is missing, and Flare surfaces that message unchanged plus the corrective command,
- first remote setup has exactly one bootstrap contract: **authenticate → provision production/preview resources → write resource IDs → collect secrets → `wrangler secret bulk` to the explicit production Worker → apply production migrations → build → ordered Worker deploys → health checks**. `flare setup cloudflare` provisions resources, pushes required secrets immediately, and applies the first production migrations; `bun deploy` is then a normal migration-preflight/build/deploy command with no bootstrap secret file.

For Neon, `DATABASE_URL` is a secret and therefore belongs in `secrets.required`. For D1 there is no `DATABASE_URL`; the database remains a binding.

### 13.7 `bun setup` behavior

When an example file exists, `bun setup` should:

1. create the corresponding local file if missing,
2. preserve any existing values,
3. fill deterministic local URLs/ports,
4. securely generate local secrets that Flare can generate itself,
5. leave third-party credentials blank,
6. print exactly what still needs user input,
7. never overwrite a populated secret without explicit confirmation.

Example:

```text
$ bun setup

✓ created apps/server/.dev.vars
✓ generated BETTER_AUTH_SECRET
✓ AUTH_ALLOWED_HOSTS includes localhost:5173 and AUTH_PROTOCOL=http for local development
✗ DATABASE_URL — add your Neon development connection string

1 manual value required.
```

### 13.8 Production secrets

Production secrets are managed separately from local values. Stable commands:

```bash
flare env check
flare secrets list
flare secrets push
flare secrets generate BETTER_AUTH_SECRET --env production
```

`flare secrets generate` uses a cryptographically secure cross-platform generator so Flare does not require OpenSSL to be installed. The example file can still show the familiar OpenSSL command because it is documented by Better Auth, but Flare's own workflow must work on Windows, macOS, and Linux.

`flare secrets push` must show the destination Worker/environment and the secret **names** being changed, never their values, before applying production changes.

Preview secrets are a separate lifecycle. `flare secrets generate BETTER_AUTH_SECRET --env preview` writes to the gitignored `.preview.vars`, and `flare secrets push --env preview` is **topology-aware**:

- `app` / standalone `worker` using Worker Previews → validate against `secrets.required`, then run `wrangler preview base-config secret bulk` so newly created Previews inherit the values; use `wrangler preview secret bulk --name <preview>` only for an explicit active-Preview override,
- `fullstack` persistent `env.preview` pair → `wrangler secret bulk <file> --name <server-preview-worker-name>` is used before the first deploy and for later updates (explicit name, never ambient environment); the pinned Wrangler may create the draft preview server Worker when absent; the web preview Worker owns no auth/database secrets.

The same `.preview.vars` file may supply the preview Neon `DATABASE_URL` to `bun db:migrate:preview`. A committed `.preview.vars.example` lists preview secret **names** (never values) with the same commented, actionable style as `.dev.vars.example`. Production values are never read from `.preview.vars`, and preview values are never read from `.dev.vars`.

### 13.9 Environment schema and runtime access

Generated code should expose one obvious validated access layer rather than scattering `process.env`/binding reads throughout the application.

For example:

```text
src/env/
├── server.ts    # server-only secrets/bindings
└── client.ts    # explicitly public values only
```

Rules:

- validation happens at the boundary,
- server-only values cannot be imported into client code,
- Cloudflare binding types come from generated Cloudflare types,
- capability recipes extend the schema instead of hand-editing random files,
- error messages name the missing variable and how to obtain/generate it.

### 13.10 Gitignore policy

Generated projects ignore real env/secrets while keeping examples:

```gitignore
.env
.env.*
!.env.example

.dev.vars
.dev.vars.*
!.dev.vars.example

.preview.vars
.preview.vars.*
!.preview.vars.example

.wrangler/
.turbo/
dist/
```

If framework-specific local files are generated, the same rule applies: local values ignored, example/schema files committed.

### 13.11 Doctor command

A high-value Flare feature:

```bash
flare doctor
```

Checks:

- Bun version
- Git
- dependency install state
- workspace graph
- TypeScript config
- Biome config
- Cloudflare authentication
- Cloudflare config validity
- generated binding types
- required environment variables and declared Cloudflare secrets
- accidental client exposure of known server-secret keys
- D1/Neon configuration
- migration state where possible
- Better Auth required values
- shadcn `components.json`
- skill installation
- `.preview.vars` present and complete for the selected preview model
- `CLOUDFLARE_ENV` leaking into production shell/build configuration
- Wrangler version meets the preset's floor (4.135.0 for Worker Previews where used) and the pinned release fixture proves draft-Worker secret bootstrap
- never-deployed Workers that declare required secrets (prints `flare secrets push --env production`; the pinned Wrangler fixture proves secret bulk can create the draft Worker)
- `.wrangler/`, `.preview.vars`, and other local state are gitignored
- Lefthook hooks installed
- known local ports

Example output:

```text
Flare doctor

✓ Bun
✓ workspace
✓ Cloudflare auth
✓ Cloudflare types
✓ shadcn
✓ D1 binding
✓ BETTER_AUTH_SECRET
✗ GITHUB_CLIENT_SECRET
  Create a GitHub OAuth app, then add `GITHUB_CLIENT_SECRET` to apps/server/.dev.vars. Keep the non-secret `GITHUB_CLIENT_ID` in the appropriate Wrangler `vars` block.

1 issue requires attention.
```

The output must always include the fix, not just the error.


## 14. Project manifest and operational lifecycle

Flare must remain useful after scaffolding. Every generated repository therefore includes a machine-readable project manifest:

```ts
// flare.config.ts
export default defineFlareConfig({
  schemaVersion: 1,
  flareVersion: "0.14.x",
  productionBranch: "main",
  preset: "app",
  database: "d1",
  auth: "better-auth",
  observability: "evlog",
  uiLint: "shadcn",
  capabilities: ["mcp"],
  deployment: {
    provider: "cloudflare",
    productionBranch: "main",
  },
})
```

This is Flare's source of truth for **intent**: preset, capabilities, environment names, selected providers, and Flare/template schema. Concrete Cloudflare deployment state such as Worker names, resource IDs, routes, and resolved Service Binding targets lives in `wrangler.jsonc`. `flare doctor` checks that the manifest intent and Wrangler deployment configuration agree. Commands should not guess architecture from package names when the manifest can state it explicitly, and the manifest must not duplicate mutable Cloudflare resource IDs as a competing source of truth.

### 14.1 Environment and topology isolation

Flare models three environments explicitly:

```text
local
preview
production
```

Mutable resources must be isolated by environment. A preview must not silently reuse production D1, Neon, R2, KV, Queue, or other mutable production resources.

Concrete database rules:

- **D1:** local uses local D1 state; preview uses a distinct preview D1; production uses a distinct production D1.
- **Neon:** local/development uses a non-production branch/database; preview uses an isolated preview branch/database; production uses the production branch/database.
- deleting/cleaning preview resources must never delete or mutate production resources.

For `fullstack`, **service topology is part of isolation too**:

```text
production web → production server → production resources
preview web    → preview server    → preview resources
local web      → local server      → local/simulated resources
```

Cloudflare Worker Previews are not used for fullstack v1 because Preview Service Bindings currently resolve to the downstream Worker's production deployment. Flare instead deploys a persistent `env.preview` pair with explicit names such as `my-app-web-preview` and `my-app-server-preview` and an environment-specific Service Binding.

`flare.config.ts` records only architectural intent and environment names. Concrete Worker names, resource IDs, routes, vars, and Service Binding targets live in `wrangler.jsonc`. `flare doctor` resolves the concrete Wrangler state before cleanup or mutation.

### 14.2 Resource source of truth

`flare.config.ts` is the source of truth for **intent**: preset, selected capabilities, providers, environment names, and Flare/template versions. `wrangler.jsonc` is the concrete Cloudflare source of truth for Worker names, routes, resource IDs, binding targets, `vars`, environment bindings, and required-secret names.

`flare doctor` verifies that concrete Wrangler state satisfies the manifest intent. Flare never copies mutable Cloudflare IDs into both places.

### 14.3 Bootstrap after clone

A cloned project should recover to a usable state with:

```bash
bun install
bun setup
bun dev
```

`bun setup` should:

1. install/repair Lefthook,
2. generate Cloudflare types,
3. validate local environment files,
4. initialize safe local resources,
5. validate database tooling if configured,
6. validate evlog and UI-lint configuration,
7. print only the remaining manual actions.

### 14.4 Secrets lifecycle

Stable commands:

```bash
flare env check
flare secrets list
flare secrets push
```

Secret values must never be echoed back by default. Client-visible environment variables and server-only secrets are separate concepts in the manifest and validation layer.

### 14.5 Database development ergonomics

When a database exists, expose consistent commands where supported:

```bash
bun db:generate
bun db:migrate
bun db:migrate:preview
bun db:migrate:prod
bun db:seed
bun db:reset
bun db:studio
```

Neon development should use a non-production database/branch. D1 local development uses local state unless remote use is explicitly requested. `bun db:reset` may delete only the canonical repository-root `.wrangler/state` data for the selected local project; it never deletes arbitrary parent paths or any remote database.

### 14.6 Deployment operations

Flare owns stable operational verbs:

```bash
flare deployments
flare logs
flare tail
flare rollback
flare resources
flare preview clean
```

A future `flare destroy` command is allowed only with strong safeguards, a printed resource plan, and explicit confirmation.

### 14.7 Upgrade strategy

Generated projects record both Flare and template/schema versions. Future upgrades use:

```bash
flare upgrade --dry-run
flare upgrade
```

Upgrades must show a plan/diff before changing architecture-sensitive files.

### 14.8 Transactional and Git-aware mutations

Commands that mutate an existing project (`flare add`, `flare upgrade`, resource/config changes) should be boring and recoverable:

1. inspect `flare.config.ts`,
2. create a change plan,
3. refuse risky edits on a dirty worktree by default,
4. support `--dry-run`,
5. apply filesystem/config changes transactionally where practical,
6. run relevant validation,
7. roll back generated **local** changes if validation fails,
8. execute remote side effects last,
9. make remote steps idempotent and record their resulting IDs/state,
10. print exactly what changed.

Remote operations such as creating D1/R2 resources or pushing secrets are **not** transactionally reversible and Flare never pretends otherwise. It does not auto-delete a remote resource merely because a later local step failed. Instead it reports the remote state and provides an explicit cleanup command when safe.

### 14.9 Security defaults

Flare configures a small, explicit baseline instead of adding a separate security framework:

- server-only secrets never enter client bundles,
- Better Auth uses secure production cookies and explicit trusted origins,
- Better Auth production rate limiting uses durable database storage rather than per-isolate memory and reads `cf-connecting-ip`,
- input boundaries use schema validation,
- logging redacts sensitive fields,
- `.gitignore` covers local secret files, `.wrangler/`, and generated sensitive state,
- CORS exists only where the project shape genuinely requires cross-origin access.

For browser-facing web responses, static assets use Cloudflare's headers mechanism and Worker-generated `/api/*` responses apply the same baseline in code:

```text
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
X-Frame-Options: DENY
Content-Security-Policy-Report-Only: default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
```

The base v1 scaffold emits **no HSTS header**. HSTS becomes an explicit custom-domain hardening step after the developer deliberately enables a stable HTTPS domain; Flare never turns it on automatically for a generic `workers.dev` first deploy. CSP begins in **Report-Only** mode because real projects frequently need additional image/script/connect sources. A project can promote it to enforcing CSP after reviewing browser output.

Preview responses additionally include `X-Robots-Tag: noindex, nofollow` (Cloudflare already supplies this on `workers.dev` Worker Preview URLs; Flare still emits it for persistent/custom-domain preview paths).

Implementation rules:

- `X-Frame-Options: DENY` is **enforcing** on purpose: the CSP starts in Report-Only mode and would otherwise leave clickjacking unprotected during the first releases.
- static assets get these headers from a generated `_headers` file, which Cloudflare applies **only to static asset responses**, not to responses the Worker generates; the preview build (`CLOUDFLARE_ENV=preview`) emits the same file plus the `X-Robots-Tag` rule, and the production build never includes it,
- the server **must not call bare `secureHeaders()`**, because Hono's defaults add headers Flare did not choose (including HSTS, COOP/CORP, Origin-Agent-Cluster, and a different Referrer-Policy/X-Frame-Options),
- `/api/*` uses a small explicit Hono middleware that writes exactly the five baseline headers above; using `secureHeaders({...})` internally is allowed only if every unrelated default is explicitly disabled and the release fixture proves the emitted header set is identical,
- Report-Only violations are visible in the browser console; v1 adds no reporting endpoint, so promoting CSP to enforcing is a manual review step,
- the release harness fetches the public document and `/api/health` on a deployed fixture and asserts the exact header values, absence of default HSTS, and absence of `X-Robots-Tag` in production.

---

## 15. Root monorepo structure

Even simple projects use the same predictable workspace model so new surfaces can be added later.

```text
my-project/
├── apps/
│   └── ...
│
├── packages/
│   ├── ui/                 # web-capable projects
│   ├── config/
│   ├── db/                 # only when database enabled
│   └── shared/             # only when useful
│
├── .agents/
│   └── skills/
│
├── AGENTS.md
├── biome.json
├── turbo.json
├── tsconfig.json
├── package.json
├── bun.lock
└── README.md
```

Do not create empty packages just to make the tree look architectural.

---

## 16. Root commands

Flare has exactly two setup concepts:

- `bun setup` — local clone/bootstrap: env examples, generated local secrets, Wrangler types, local D1 state/migrations, Lefthook install, and local validation.
- `flare setup cloudflare` — remote provisioning: Cloudflare authentication, production/preview resources, Workers Builds settings/branch guard, immediate remote secret push, and provider-specific deployment prerequisites.

There is no `bun setup:cloudflare` alias in v1.


The command surface should remain the same across project shapes whenever possible.

```bash
bun dev
bun run build
bun check
bun verify
bun format
bun preview
bun deploy
```

Optional capabilities add:

```bash
bun db:generate
bun db:migrate
bun db:migrate:preview
bun db:migrate:prod
bun db:studio
```

Root `package.json` concept:

```json
{
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "typecheck": "turbo run typecheck",
    "lint": "biome check .",
    "ui:lint": "eslint . --max-warnings=0",
    "format": "biome format --write .",
    "check": "bun run typecheck && bun run lint && bun run ui:lint",
    "verify": "bun run check && bun run build",
    "preview": "flare preview",
    "deploy": "flare deploy",
    "deploy:cloudflare": "flare deploy --cloudflare-only"
  }
}
```

The exact scripts can evolve, but the human-facing names should stay boring and stable.

---


Setup command split:

- `bun setup` — local clone/bootstrap: generate local secrets, validate env, install Lefthook, regenerate types, initialize local state.
- `flare setup cloudflare` — remote Cloudflare provisioning/configuration: authenticate, provision/resolve resources, configure required preview/production secrets, and prepare Git-connected deployment.

There is no `bun setup:cloudflare` command.

## 17. Code quality defaults

### Biome

Use one root Biome config.

Responsibilities:

- formatting
- linting
- import organization where appropriate

Avoid installing ESLint + Prettier + several overlapping plugins unless a framework actually requires them.


### `@shadcn/lint`

Web-capable workspaces install `@shadcn/lint` as a dedicated design-system gate. A minimal ESLint configuration hosts only these rules; Biome remains responsible for general formatting and code linting.

The base policy should reject raw colors, arbitrary values, inline styles, unknown classes, dynamic Tailwind class construction, and unauthorized component restyling. The goal is to make both humans and coding agents consume the shared design system instead of silently drifting away from it.

`bun ui:lint` is part of `bun check` and therefore also part of pre-push and deployment verification. ESLint exists only as the host required by `@shadcn/lint`; Flare should remove it when the chosen non-ESLint engine has stable, compatible support for the shadcn plugin/rules and the release matrix proves parity.

### evlog

Server-capable presets use evlog rather than ad-hoc server `console.log` statements. Production logs are structured, sensitive fields are redacted, and request/job-wide events should accumulate useful context before emission.

Flare does not replace Cloudflare Workers Logs; evlog produces the structured application events that Cloudflare can index and query.

### TypeScript

TypeScript is a hard gate.

Recommended project posture:

- strict mode
- no unchecked accidental `any`
- modern module resolution
- explicit browser/server boundaries
- generated Cloudflare environment types

### Testing policy

Generated Flare projects include **no testing framework by default**. Flare does not install optional unit-test tooling, optional browser E2E tooling, browser binaries, test files, or `bun test` scripts into a fresh project.

This follows the minimalist starter philosophy: a new project should carry only the dependencies needed to build, check, run, and deploy the selected project shape. If a real project later needs unit, integration, Worker-runtime, or browser E2E testing, add the appropriate tooling deliberately for that project. A future optional recipe may automate this, but it is not part of the v1 base scaffold.

Flare's own repository may use internal verification tooling to validate generated fixtures before a Flare release. Those development dependencies belong to Flare itself and must not leak into generated application repositories.

### Cross-platform scripting

Generated projects and the Flare CLI must work on Windows, macOS, and Linux. Do not encode Unix-only setup commands such as `mkdir -p`, `cp`, `rm -rf`, `sed`, or shell-specific path assumptions into the product contract.

Prefer Bun/TypeScript scripts and Node-compatible filesystem APIs for generator/setup operations. OS-specific shell commands are acceptable only when guarded behind a platform adapter and covered by the Flare release matrix.

### Quality gates, not generated GitHub CI

Generated Flare projects do **not** include GitHub Actions by default.

Quality validation lives in reusable project commands and Git hooks:

```text
pre-commit
→ staged Biome + staged UI/design lint

pre-push
→ bun check
→ full Biome + @shadcn/lint + typecheck

production build
→ `bun run verify` at explicit verify/deploy time
```

Cloudflare Workers Builds executes `bun run verify` immediately before an automatic production deployment. This avoids maintaining a second copy of validation logic in GitHub Actions YAML.

The Flare generator repository itself may use automation for release/template verification if useful, but generated application repositories remain free of CI configuration unless explicitly requested.

---

## 18. Flare recipes

Do not build a huge general plugin engine for v1.

Implement a small recipe system for the operations I genuinely repeat.

### Initial recipes

```bash
flare add db --provider d1
flare add db --provider neon
flare add auth
flare add mcp
flare add r2
flare add email
flare add public-api
```

Shape-changing operations such as `flare add server` or `flare add extension` are **not v1 recipes**. Choose `fullstack` or `extension` when creating the project. Converting one architectural shape into another is migration tooling and can be designed later instead of pretending it is a safe additive patch.

#### Recipe applicability

| Recipe | app | fullstack | extension | worker |
|---|:---:|:---:|:---:|:---:|
| D1 / Neon DB | ✓ | ✓ | — | ✓ |
| Better Auth session auth | ✓ | ✓ | — | — |
| MCP | ✓ | ✓ | — | ✓ |
| R2 | ✓ | ✓ | — | ✓ |
| Email | ✓ | ✓ | — | ✓ |
| Public API/OpenAPI | — | ✓ | — | ✓ |

A recipe must reject unsupported preset/capability combinations before touching the filesystem or Cloudflare account. Flare's release matrix includes at least one positive fixture for every supported pair and negative fixtures for invalid combinations.

### Recipe contract

A recipe can:

- add dependencies,
- add files,
- patch known config files,
- add Cloudflare bindings,
- add environment schema entries,
- add/update Agent Skills,
- add scripts,
- run a validation step.

Every recipe must be:

- idempotent,
- deterministic,
- testable,
- capable of explaining what it will change.

Future UX:

```bash
flare add auth --dry-run
flare add auth --diff
```

This mirrors the useful safety model now present in shadcn CLI without trying to copy the entire shadcn implementation.

---

## 19. Flare source repository

Recommended architecture for the generator itself:

```text
flare/
├── packages/
│   ├── create-flare-stack/
│   │   ├── src/
│   │   │   ├── cli/
│   │   │   ├── generator/
│   │   │   ├── recipes/
│   │   │   ├── doctor/
│   │   │   └── config/
│   │   └── package.json
│   │
│   ├── flare-cli/                 # published `flare` lifecycle CLI
│   └── flare-core/                # internal shared planning/config/mutation engine
│
├── templates/
│   ├── base/
│   ├── app/
│   ├── fullstack/
│   ├── extension/
│   └── worker/
│
├── recipes/
│   ├── db-d1/
│   ├── db-neon/
│   ├── better-auth/
│   ├── mcp/
│   ├── r2/
│   └── email/
│
├── skills/
│   ├── flare-project/
│   ├── flare-web/
│   ├── flare-extension/
│   └── flare-mcp/
│
├── registry/
│   └── ...
├── registry.json
├── package.json
└── README.md
```

### Distribution and package boundaries

Ship the product as two public packages from day one, backed by an internal shared core package:

```text
create-flare-stack   # scaffolding entrypoint used by `bun create flare-stack`
flare                # lifecycle CLI used inside generated projects

internal: flare-core # shared generator/doctor/recipe/deploy primitives; not a user-facing package
```

Templates are versioned with the Flare release that generated them. The shadcn/GitHub registry may be versioned separately when necessary, but a generated project must record the exact Flare/template schema that created it.

Release automation belongs in the Flare repository itself. Generated application repositories should still contain no GitHub Actions by default.

### Reference application

Maintain one first-party reference app built only with Flare conventions:

```text
TanStack Start
+ D1
+ Drizzle
+ Better Auth
+ shadcn/ui
+ @shadcn/lint
+ evlog
+ Cloudflare
```

The reference app is a usability test for the stack, not a showcase product. If normal development in that app feels awkward, fix the Flare convention before expanding the generator.

### Template composition

Generation should roughly be:

```text
base
  + project-shape overlay
  + database overlay
  + capability overlays
  + skills
  + generated config
  + install
  + validation
```

This is much easier to maintain than a giant matrix of hand-written conditionals.

---

## 20. Generator pipeline

When the user runs:

```bash
bun create flare-stack my-app
```

Flare should:

1. validate the project name and destination,
2. collect the minimal project-shape/capability choices,
3. copy the base workspace template,
4. apply the selected project-shape template,
5. apply D1 or Neon if selected,
6. apply Better Auth if selected,
7. apply other selected recipes,
8. configure shadcn monorepo files for every web surface,
9. add the Flare UI preset/theme,
10. install the appropriate Agent Skills,
11. generate `AGENTS.md`,
12. write `.env.example` / `.dev.vars.example`,
13. install dependencies with Bun,
14. generate Cloudflare binding types,
15. run `bun check`,
16. initialize Git,
17. install Lefthook Git hooks,
18. validate the production build with `bun verify`,
19. print the exact local-development, preview, local-deploy, and Cloudflare Git-deploy commands.

If the final validation fails, the generator should not print a fake success message. It should explain the failing command and remediation.

For mutations to an existing project (`flare add`, `flare upgrade`, resource/config changes), use a stricter lifecycle:

```text
plan
→ validate preconditions
→ stage changes in temporary state
→ apply
→ verify
→ commit filesystem/config changes
```

If verification fails, Flare restores the pre-command state wherever practical. A half-applied auth/database recipe is a product bug.

---

## 21. 15-minute first-deploy flow

Target flow for a normal web application:

```bash
bun create flare-stack my-app
cd my-app
bun dev
```

Developer sees the app locally.

Then the developer can deploy directly from the machine:

```bash
bun deploy
```

or connect the repository to Cloudflare Workers Builds and make `main` the production branch. After that, merging to `main` automatically runs the same production verification and deployment commands on Cloudflare.

For a project requiring only local-emulated Cloudflare resources, the direct local path should deploy without manual source edits.

When a remote resource must be created, Flare exposes one explicit remote setup step:

```bash
flare setup cloudflare
```

That step provisions/resolves required resource IDs, validates auth, configures required preview/production secrets, and updates generated Cloudflare configuration.

The user should not need to manually copy database IDs between dashboard pages and config files if the CLI can safely do it.

### Acceptance target

On a machine with Bun and Git already installed and a Cloudflare account available:

**Preset: `app` + D1 + Better Auth**

Within approximately 15 minutes the developer should be able to:

- scaffold,
- install,
- run locally,
- create/apply the database,
- pass checks,
- deploy to a `workers.dev` URL.

OAuth credentials or domain-specific email configuration are naturally outside that guarantee.

---

## 22. Suggested generated `AGENTS.md`

Keep this short. Do not duplicate every skill.

```md
# Project instructions

This repository was generated with Flare Stack.

## Package manager
Use Bun. Do not replace Bun commands with npm, pnpm, or yarn.
When a package script name collides with a Bun built-in, use `bun run <script>`. In particular, use `bun run build`, never `bun build`. Generated projects do not define `bun test`; do not add a test framework unless the project explicitly chooses one.

## Commands
- `bun dev` - run local development
- `bun check` - required quality gate
- `bun run build` - production build
- `bun deploy` - deploy Cloudflare workloads

## Architecture
Read the workspace-specific AGENTS.md before modifying a deployable app.

## Cloudflare
This project targets Cloudflare Workers. Prefer Workers-compatible APIs and the generated Cloudflare bindings/types.
Do not hand-edit generated binding types.

## UI
Use the shared UI package and shadcn conventions. Do not create a duplicate primitive before checking the existing UI package/registry.

## UI lint
Treat @shadcn/lint failures as design-system violations. Prefer tokens and shared component variants over suppressions.

## Logging
Use evlog for server-side logs. Prefer structured request/job context and never log secrets.

## Database
Use `packages/db`. Do not instantiate an unrelated ORM or database client inside feature code.

## Quality gate
Before finishing a code change, run `bun check`; run any project-specific tests only if that project has chosen to add them.

## Skills
Task-specific procedures live under `.agents/skills`. Load the matching skill when modifying auth, Cloudflare resources, database code, UI, MCP, or extension code.
```

Workspace-specific `AGENTS.md` files can then contain only the differences for `apps/web`, `apps/server`, and `apps/extension`.

---

## 23. Example generated projects

### Anansi-like project

```bash
bun create flare-stack anansi --preset app --db d1 --auth --mcp
```

```text
apps/web
packages/ui
packages/db
.agents/skills
```

No standalone Hono server.

### SaaS

```bash
bun create flare-stack my-saas --preset fullstack --db neon --auth
```

```text
apps/web
apps/server
packages/ui
packages/db
packages/shared
```

### Browser extension

```bash
bun create flare-stack renewal-radar --preset extension
```

If this product later needs a backend, do not mutate the `extension` preset in v1. Start the backend as an explicit `worker`/`fullstack` project and share packages deliberately. Shape-migration tooling is post-v1.

### MCP/API experiment

```bash
bun create flare-stack bookmarks-mcp --preset worker --db d1 --mcp
```

---

## 24. What should NOT be in v1

Avoid scope creep.

Do not initially build:

- arbitrary frontend-framework selection,
- arbitrary deployment-provider selection,
- Prisma selection,
- a dozen databases,
- Stripe vs Polar vs Lemon Squeezy selection,
- analytics-provider selection,
- Kubernetes/Docker support,
- a generic plugin marketplace,
- automatic migration between D1 and Neon,
- every Better Auth plugin,
- a massive example application.

Flare becomes valuable by being reliable, not by having the longest menu.

---

## 25. V1 implementation phases

Implementation now starts with one narrow vertical slice and expands only after that path is reliable.

### Phase 1 — reference `app` without database

Build and use the first-party reference project around the same primitives the generator will emit:

- `create-flare-stack`,
- Bun workspaces + Turborepo,
- Biome + strict TypeScript,
- TanStack Start + React 19,
- Cloudflare Vite + `wrangler.jsonc` + generated Wrangler types,
- shadcn/ui + Flare preset,
- `@shadcn/lint`,
- evlog,
- Agent Skills + `AGENTS.md`,
- Lefthook,
- `flare.config.ts`,
- `bun setup`, `bun dev`, `bun check`, `bun run build`, `bun preview`, `bun deploy`,
- `flare doctor`, `flare logs`, `flare tail`,
- post-deploy health verification.

Acceptance: a fresh machine can scaffold, clone/setup, develop, verify, preview, and deploy this preset without manual source edits.

### Phase 2 — D1

Add the D1 profile, Drizzle, migrations, seed/reset/studio commands, local/preview/production resource isolation, and database-specific skills.

Acceptance: `app + D1` passes scaffold checks, production build, preview deployment, and deployment health verification.

### Phase 3 — Neon

Add the Neon Postgres profile with the same Drizzle-facing app contract and explicit dev/preview/production branch/database rules.

Acceptance: `app + Neon` reaches parity with `app + D1`.

### Phase 4 — Better Auth

Add the minimal Better Auth baseline across both database profiles. Keep email verification/reset and OAuth outside the base capability.

Acceptance:

```text
app + D1 + auth
app + Neon + auth
```

Both must scaffold, build, and deploy with the expected auth routes and environment requirements.

### Phase 5 — `fullstack`

Add `apps/web + apps/server`, Hono, **Hono RPC** as the default internal API contract, explicit type-only workspace dependency wiring, and the same-origin Service Binding model:

- web Worker is the only public first-party origin,
- `/api/*` uses `assets.run_worker_first`,
- the web Worker forwards the original `Request` to the server Service Binding,
- production server sets `workers_dev: false`, `preview_urls: false`, and no public route,
- local development uses Cloudflare Vite `auxiliaryWorkers` so it exercises the real Service Binding topology,
- Better Auth base URL is always the browser-facing web origin,
- CORS is added only for an explicit external API,
- production Git deployment has **one** Workers Build trigger (web) that deploys server then web,
- `bun preview` deploys `server-preview` then `web-preview` with isolated preview DB/resources; branch Worker Previews are disabled for fullstack v1.

Acceptance:

```text
fullstack + no db
fullstack + D1 + auth
fullstack + Neon + auth
```

For every fullstack fixture, the release harness must prove that preview traffic reaches the preview server/resources and never production; the preview web build uses `CLOUDFLARE_ENV=preview`; the generated web deploy config binds `server-preview`; non-production/Preview Builds are disabled on the Git-connected web Worker; the private server exposes no `workers.dev`, Preview URL, or route; `/api/*` runs Worker-first; first deployment succeeds from an empty Cloudflare account after required-secret bulk push; and deployment order is server then web. The auth-enabled fixture must additionally pass one CI-only real-browser sign-in/session check against the deployed public web origin. These are Flare release tests, not dependencies generated into user projects.

### Phase 6 — `extension` and `worker`

Add WXT and standalone Hono Worker presets while reusing the same config, logging, skills, quality, and deployment conventions.

### Phase 7 — recipes, lifecycle, and registry

Add:

- transactional `flare add ...`,
- shadcn GitHub registry,
- MCP, R2, email, public-API/OpenAPI recipes,
- `flare upgrade --dry-run`,
- deployment history/rollback/resource cleanup,
- guarded destroy lifecycle.

Do not start Phase 7 until the preset matrix is stable.

## 26. Verification matrix for Flare itself

Every Flare release should generate projects in CI and verify them.

Minimum matrix:

| Preset | DB | Auth | Expected |
|---|---|---:|---|
| app | none | no | pass |
| app | D1 | no | pass |
| app | D1 | yes | pass |
| app | Neon | no | pass |
| app | Neon | yes | pass |
| fullstack | none | no | pass |
| fullstack | D1 | yes | pass |
| fullstack | Neon | yes | pass |
| extension | none | no | pass |
| worker | none | no | pass |
| worker | D1 | no | pass |

Each generated project should run:

```bash
bun install
bun setup
bun check
bun ui:lint
bun run build
```

Generated fixtures do not install or run a browser-test framework. For fullstack fixtures, the release harness also verifies that production and preview Service Bindings target the correct server environments, the private production server has no public workers.dev/preview URL, `/api/*` runs Worker-first instead of falling through to SPA assets, and the ordered deploy script deploys server before web.  Flare's own release harness may use an external/CI-only real-browser check for the `fullstack + auth` acceptance case so the same-origin session flow is proven after deployment; that harness must not leak dependencies into generated projects. Standalone `worker` fixtures exercise `/health`; fullstack fixtures exercise `/api/health` through the public web Worker. Both exercise one evlog request/error path and production-mode JSON/redaction wiring.

The release harness also includes these regression checks:

- missing required secret → deploy fails with the provider error plus Flare remediation,
- preview and production required secrets are independently configured,
- `app + D1` and `worker + D1` Worker Previews bind preview D1 resources explicitly,
- local D1 migration is visible to the running Vite/Worker process through the canonical `.wrangler/state` path,
- changing a server Hono RPC type without updating the web consumer makes `bun check` fail,
- fullstack `bun dev` starts only the Vite web process and does not double-start the auxiliary server,
- the pinned Vite plugin loads the auxiliary server Worker's `apps/server/.dev.vars` required secrets exactly once during local fullstack development,
- Better Auth dynamic base URL accepts localhost, the resolved production host, and the intended preview host, and rejects an unlisted Host header,
- the web Workers Build uses repo-root changes (no narrowed watch paths) and non-production branch builds are disabled,
- first fullstack deploy from an empty account provisions mutable resources, pushes required server secrets with `wrangler secret bulk`, applies migrations, then deploys server and web,
- `/api/health` and the root document both succeed after deployment,
- fullstack rollback logic targets web first, then server, restores a recorded paired release tag, and never rewinds the database,
- first database-backed deploy from an empty Cloudflare account provisions the DB, pushes required secrets to a draft Worker with `wrangler secret bulk`, applies migrations, and then deploys successfully,
- `bun preview` migrates only the preview DB before code deploys,
- a non-production branch Workers Build executes the Flare guard and uploads no Worker,
- production deploy refuses to run when `CLOUDFLARE_ENV` is set,
- `/api/health` returns only `{ "ok": true }`,
- a deployed Neon fixture survives two consecutive requests with the request-scoped client lifecycle,
- Better Auth rate limiting persists across separate Worker requests/isolate executions, and `/get-session` performs no rate-limit write,
- an `app + D1` Worker Preview created after `flare secrets push --env preview` receives all required Preview Base secrets; an explicit `wrangler preview secret bulk --name` override updates only the targeted Preview,
- `wrangler secret bulk` against a never-deployed Worker creates the draft Worker under the pinned Wrangler version, after which the normal deploy succeeds with `secrets.required`,
- a named Worker Preview redeployed twice still lists every required secret (the post-deploy secret verification repairs a dropped secret or fails loudly),
- a session cookie issued by a deployed fixture carries the `Secure` flag, and local development over `http://localhost` still signs in,
- a request with a spoofed `X-Forwarded-Host` or `Host` outside `AUTH_ALLOWED_HOSTS` is rejected,
- every `app`/`worker` config contains a `previews` block (empty when no Preview-specific bindings are needed),
- `bun dev` under `CLOUDFLARE_ENV=development` gives the auxiliary server Worker its local `AUTH_ALLOWED_HOSTS`/`AUTH_PROTOCOL` and its `.dev.vars` secrets, while `bun build`/`bun deploy` never inherit that variable,
- the generated server config is found by `name` even when the output directory name differs,
- production deploy refuses when `WORKERS_CI_BRANCH` is a non-production branch,
- deployed fixtures return the full security-header baseline on the document and `/api/health`, and preview responses carry `X-Robots-Tag` while production responses do not,
- `flare rollback` refuses cleanly when one half of the recorded release pair has aged out.

At minimum, the base `app` scaffold should be verified on **Windows, macOS, and Linux** for every Flare release. The wider preset/database matrix may run on Linux for cost/speed, but cross-platform setup and path handling must always have explicit coverage.

Where Cloudflare supports non-interactive preview/build validation, include it. Server-capable fixtures should also exercise at least one evlog request/error path and assert that production-mode output is structured and redaction rules are wired.

This CI matrix is what prevents Flare from turning into the kind of starter that looks impressive but breaks before development begins.

---

## 27. Versioning strategy

Flare should pin the versions used by a release rather than installing uncontrolled `latest` versions during every scaffold. Generated projects use **exact tested versions** at scaffold time for Flare-owned core dependencies. Coordinated upgrades happen through `flare upgrade`, not by silently widening the dependency graph.

Example:

```text
Flare 0.1.x
  → tested React version
  → tested TanStack version
  → tested Cloudflare Vite + Wrangler versions
  → optional tested `cf` beta version when experimental support is enabled
  → tested shadcn version/preset
  → tested @shadcn/lint version
  → tested evlog version
  → tested Better Auth version
  → tested Drizzle version
```

The Flare repository can use Renovate/Dependabot to propose dependency upgrades. CI regenerates the matrix. Only after all presets pass should a new Flare release move those versions.

This is central to the promise that a newly generated repo works immediately.

---

## 28. Implementation-ready decisions

The following decisions are frozen for the first implementation unless real reference-app usage proves them wrong:

- project shape is selected before capabilities,
- Hono RPC is the internal API contract for `fullstack`,
- Better Auth base scope is email/password + sessions only,
- D1 and Neon are separate Drizzle profiles, never a runtime dual-driver switch,
- local/preview/production resources are isolated by default,
- Biome handles general formatting/linting; `@shadcn/lint` handles UI/design-system policy,
- evlog is the default server logger,
- generated projects include no testing framework by default,
- Lefthook provides local quality gates,
- generated repos have no GitHub Actions by default,
- direct `bun deploy` and the single Git-connected fullstack web build reuse the same verification/deploy orchestration; the web build deploys server then web in order,
- `fullstack` uses one public web origin and a private Hono Worker reached through a Service Binding,
- Wrangler/`wrangler.jsonc` is the v1 default; `cf`/`cloudflare.config.ts` is experimental opt-in,
- database deploys fail when required production migrations are pending,
- post-deploy health verification uses a lightweight HTTP check and adds no generated test framework,
- CLI/setup scripts must be Windows/macOS/Linux safe,
- mutating commands are planned, dry-runnable, Git-aware, and recoverable,
- generated projects pin exact tested core dependency versions,
- `create-flare-stack` scaffolds; `flare` manages the project lifecycle,
- the first-party reference app is the proving ground for every major convention.

At this point, the remaining work is implementation and feedback from using the reference app. New infrastructure features should be rejected from the base unless repeated real-world use proves they belong there.

---

## 28.1 Known v1 limits

- `fullstack` has one persistent remote preview pair, not isolated branch-by-branch preview stacks. Concurrent branches can overwrite it.
- `auxiliaryWorkers` is pinned and release-tested; a local proxy fallback exists because the API is still evolving.
- Shape conversion (`app` → `fullstack`, adding an extension to an existing project) is not a v1 recipe.
- Remote resource creation and secret pushes are idempotent where practical but are not transactionally auto-reverted.
- Preview protection with Cloudflare Access is recommended for sensitive projects but is not forced into the minimal v1 setup.

## 29. v0.14 freeze decisions

The following are frozen for implementation and should not be reopened unless a fixture proves they fail:

- top-level Wrangler config is production; preview selection is command-scoped, never ambient,
- fullstack is one Vite build containing the public web Worker plus auxiliary private server Worker,
- fullstack deployment is ordered server → web from that single build output,
- browser-visible fullstack routes are `/api/*`; the standalone worker uses root routes such as `/health`,
- first deploy provisions DB/resources, pushes required secrets with `wrangler secret bulk` to the explicit Worker name (creating a draft Worker when absent under the pinned Wrangler), applies migrations, then performs the normal ordered deploy,
- production migrations remain explicit; preview migrations run automatically before preview code deploys,
- fullstack branch Worker Previews are disabled and the Preview/non-production command has a no-upload backstop,
- `CLOUDFLARE_ENV` must be unset for production,
- Neon preview/prod URLs are supplied explicitly in v1; no Neon management token is required,
- Better Auth rate limits use durable database storage and Cloudflare's connecting-IP header,
- public health responses expose only `{ ok: true }`,
- coordinated Worker versions share a release tag so rollback can restore a known pair,
- local filesystem changes can be transactional; remote Cloudflare side effects are idempotent and recorded, not auto-reverted,
- the Markdown spec is the human normative source; `spec.json` is generated/synchronized from it as part of Flare's release process,
- preview secrets are topology-aware: Worker Preview presets use Preview Base secrets (`wrangler preview base-config secret bulk`), while fullstack persistent `env.preview` uses the normal Wrangler environment deploy/secret path; `wrangler preview` never receives `--secrets-file`,
- production deploys refuse to run when `CLOUDFLARE_ENV` is set or when `WORKERS_CI_BRANCH` is not the recorded production branch,
- the generated server config is located by its `name` field, never by directory name,
- Better Auth rate limiting is explicit, database-backed, keyed by `cf-connecting-ip`, and exempts `/get-session`,
- `X-Frame-Options: DENY` is enforcing while CSP is Report-Only,
- Wrangler floor: 4.135.0 for projects using Worker Previews; draft-Worker secret bootstrap is pinned-version fixture-gated rather than assigned an unverified historical minimum,
- rollback refuses rather than pairing with an expired Worker version,
- Neon stays on the serverless driver in v1 with Hyperdrive as the documented switch path (see §6.2).
- Neon pools are request-scoped and `pool.end()` is invoked only after the request/database work settles (normally in `finally`), never inside a factory that returns a live DB handle.
- Better Auth uses dynamic `baseURL.allowedHosts`; the base stack does not generate `BETTER_AUTH_URL`,
- Better Auth `protocol` is explicit per environment (`AUTH_PROTOCOL`: `http` local, `https` on Cloudflare), never `auto`, so the cookie `Secure` flag never depends on `NODE_ENV`,
- local allowlist entries use explicit ports, and forwarded headers are never trusted,
- local development selects a generated Wrangler `development` environment (`CLOUDFLARE_ENV=development` for `bun dev` only); development, preview, and production blocks are generated from one template and checked for parity by `flare doctor`,
- social login is not supported on per-branch Worker Previews in v1,
- `bun preview` verifies required Preview secrets after every deploy and repairs or fails,
- production secrets are pushed immediately with `wrangler secret bulk`; Flare stores no resumable plaintext production-secret file in the repository.
- Workers Builds uses `bun check` for the fullstack build command; the deploy command owns the single production Vite build, so fullstack is not built twice,
- production `AUTH_ALLOWED_HOSTS` never contains localhost; local hosts exist only in `env.development`,
- Better Auth supports `localhost:*`, but Flare intentionally emits exact known development ports for a narrower allowlist,
- the v1 `extension` preset is extension-only; a backend is a separate Flare project.

---

## 30. Final product philosophy

Flare is best described as:

> **My tested TypeScript startup pack for Cloudflare. Pick the shape of the product, not every library in the ecosystem.**

It should feel like Rubik's simplicity, while supporting the few architectures I actually use.

The important distinction is:

```text
Better T Stack
→ compose arbitrary technology choices

Rubik
→ one fixed golden path

Flare
→ a few tested golden paths that share the same conventions
```

That means I can build a TanStack Start app today, create a companion extension or backend project tomorrow, and keep the same UI conventions, database patterns, linting, design-system enforcement, structured logging, commands, environment system, Cloudflare deployment model, and agent context across those Flare projects.

That is the reason to build Flare.

---

# Research notes

The following current capabilities informed this specification.

## Cloudflare

On **2026-09-28**, Cloudflare introduced the `cf` CLI in open beta. Cloudflare describes Vite as the default development direction and `cloudflare.config.ts` as its new TypeScript configuration format. The new configuration exposes typed bindings for resources such as D1, R2, KV, queues, secrets, Workers, AI, and Vectorize. Cloudflare also states that its Vite plugin is the recommended way to build Workers for both frontend-focused projects and backend APIs. Existing Vite-based Workers can be migrated with `cf migrate`, and `cf init`/`cf deploy` are available for new projects.

Sources:

- Cloudflare Blog, “Introducing cf: the agentic CLI for the entire Cloudflare API”, 2026-09-28.
- Cloudflare Workers Vite Plugin documentation.
- Cloudflare Workers Builds Git integration documentation.
- Cloudflare Workers Builds branch-control documentation.
- Cloudflare Workers Preview documentation.

## TanStack Start

TanStack Start currently documents Cloudflare Workers as an official deployment target using `@cloudflare/vite-plugin`.

Source:

- TanStack Start React hosting documentation.

## shadcn/ui

shadcn CLI v4 added agent skills, presets, dry-run/diff workflows, templates and first-class monorepo support. It can scaffold/configure TanStack Start, and its monorepo mode supports an app workspace plus a shared UI workspace. Preset commands can produce shareable shadcn/create links. GitHub registries can distribute arbitrary project files, not only UI components, including project conventions and agent instructions. Private GitHub registries are also supported for authenticated users.

Sources:

- shadcn/ui changelog, March 2026 CLI v4.
- shadcn/ui changelog, April 2026 preset commands.
- shadcn/ui monorepo documentation.
- shadcn/ui changelog, June 2026 GitHub registries.
- shadcn/ui changelog, August 2026 private GitHub registries.

## Agent Skills

The Agent Skills ecosystem uses `SKILL.md` files with progressive disclosure. The open `skills` CLI supports many coding agents and recognizes project-level skill locations including `.agents/skills`, `.claude/skills`, and other agent-specific directories. Modern tooling such as VS Code/GitHub Copilot also recognizes the Agent Skills format. Cloudflare and Better Auth both publish official skill repositories, while shadcn publishes an official UI skill.

Sources:

- skills.sh documentation / CLI repository.
- VS Code Agent Skills documentation.
- Cloudflare `cloudflare/skills` repository.
- Better Auth skill documentation and `better-auth/skills` repository.
- shadcn/ui skills documentation.

## evlog

evlog provides structured logging, request/job-wide events, structured errors, redaction, pretty development output, JSON production output, and a Cloudflare Workers adapter. Cloudflare Workers Logs recommends structured JSON so individual fields are extracted and indexed, which makes evlog a good default application logging layer without introducing a separate observability backend.

Sources:

- evlog introduction and Cloudflare Workers documentation.
- evlog npm package documentation.
- Cloudflare Workers Logs best practices.

## shadcn lint

`@shadcn/lint` is an agent-first Tailwind design-system linter. It can catch raw colors, arbitrary values, inline styles, unknown Tailwind classes, dynamic class construction, and restyling of shared components. It understands `components.json`, monorepo UI packages, component variants, and theme tokens. It supports ESLint and Oxlint; Flare v1 uses a minimal ESLint integration for this specialized check while keeping Biome as the general formatter/linter.

Sources:

- `shadcn-ui/lint` repository and documentation.
- shadcn CLI documentation.

## Git hooks and local checks

Generated projects use Lefthook for committed Git-hook configuration. Biome supports checking only staged files with `biome check --staged`, which maps well to a lightweight pre-commit gate. The full project verification remains a normal package script so the same command can be used by pre-push hooks, direct deployment, and Cloudflare Workers Builds.

Sources:

- Lefthook configuration and installation documentation.
- Biome CLI and VCS integration documentation.

## Better Auth

Better Auth provides a TanStack Start integration and a Drizzle adapter. The Drizzle adapter supports SQLite and PostgreSQL provider modes, which maps naturally to D1 and Neon. Better Auth also publishes Agent Skills.

Sources:

- Better Auth TanStack Start integration documentation.
- Better Auth Drizzle adapter documentation.
- Better Auth Agent Skills documentation.

## Drizzle databases

Drizzle officially supports both Cloudflare D1 and Neon Postgres. Neon connections can use serverless HTTP/WebSocket drivers suitable for serverless environments.

Sources:

- Drizzle ORM Cloudflare D1 documentation.
- Drizzle ORM Neon documentation.

---

## Recommended immediate build order

Start by building **only this path**:

```text
bun create flare-stack demo
        ↓
app preset
        ↓
TanStack Start
        ↓
shared shadcn UI
        ↓
@shadcn/lint
        ↓
evlog server logging
        ↓
flare.config.ts + env isolation
        ↓
Cloudflare Vite + Wrangler (`wrangler.jsonc`)
        ↓
Agent Skills
        ↓
bun setup
        ↓
bun dev
        ↓
bun check
        ↓
Lefthook
        ↓
bun verify
        ↓
browser
        ↓
bun deploy
        ↓
post-deploy health check
        ↓
optional Cloudflare Git-connected deploy from main
```

Once that is completely reliable, add D1, then Neon, then Better Auth.

Do not start with all four presets at once. Flare's value is the guarantee that generated projects work, so one excellent vertical path is more useful than ten half-working options.
