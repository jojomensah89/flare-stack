# Flare Stack

A Cloudflare-first TypeScript starter and lifecycle CLI. This release follows the v0.14.1 specification, distributed via official GitHub Release archives and verified live on Cloudflare Workers with remote D1 persistence and Better Auth.

## Current scope

The canonical reference is the TanStack Start `app` preset with D1 and Better Auth. The generator targets the following combinations:

| Preset    | Database | Authentication |
| --------- | -------- | -------------- |
| app       | none     | none           |
| app       | D1       | none           |
| app       | D1       | Better Auth    |
| app       | Neon     | none           |
| app       | Neon     | Better Auth    |
| fullstack | D1       | none           |
| fullstack | D1       | Better Auth    |
| fullstack | Neon     | none           |
| fullstack | Neon     | Better Auth    |

Neon profiles use `@neondatabase/serverless` with Drizzle ORM and Postgres-native migrations. `DATABASE_URL` is validated at setup and used at runtime via a request-scoped pool helper. Fullstack profiles deploy paired backend server and frontend web Workers communicating via Cloudflare Service Bindings and typed Hono RPC, with coordinated preview and rollback.

Worker, extension, recipes, registry, and upgrades remain roadmap work.

## Reference development

Use Bun throughout:

```powershell
bun install
bun setup
bun db:migrate
bun dev
```

Setup prepares local environment files, hooks, and generated Cloudflare types. Local secrets stay in ignored files. Local D1 migrations and Vite share `.wrangler/state`.

```powershell
bun check
bun run build
bun run test:auth
bun run test:fullstack
bun run test:neon
bun run test:runtime
```

The auth verification uses an in-memory SQLite fixture. The Hono verification exercises its typed client and local routes. The Neon helper verification makes no database connection. None of these commands performs a production migration or resets the reference database.

## Generator & GitHub Release distribution

The generator and lifecycle CLI are distributed as matching downloadable tarball archives on a tagged GitHub Release, without publishing packages to npm:

- `create-flare-stack-0.14.1.tgz`: The Bun generator CLI and versioned templates.
- `flare-0.14.1.tgz`: The lifecycle CLI attached to generated applications.

### Scaffolding a new application

Once uploaded to GitHub Releases:

```powershell
# D1 + Better Auth
bunx --bun --package https://github.com/jojomensah89/flare-stack/releases/download/v0.14.1/create-flare-stack-0.14.1.tgz create-flare-stack my-app --db d1 --auth

# Neon Postgres
bunx --bun --package https://github.com/jojomensah89/flare-stack/releases/download/v0.14.1/create-flare-stack-0.14.1.tgz create-flare-stack my-app --db neon

# Neon Postgres + Better Auth (fullstack)
bunx --bun --package https://github.com/jojomensah89/flare-stack/releases/download/v0.14.1/create-flare-stack-0.14.1.tgz create-flare-stack my-app --db neon --auth --topology fullstack
```

Generated projects pin `"flare"` directly to the GitHub release archive URL in their root `package.json`, which Bun installs natively.

### Preparing and verifying releases locally

```powershell
# Prepare reproducible release archives and output upload commands
bun run release:prepare

# End-to-end distribution verification over loopback HTTP
bun run test:distribution
```

### Local development and generator fixtures

```powershell
bun packages/create-flare-stack/bin/create-flare-stack.ts --help
bun run --cwd packages/flare verify
bun run --cwd packages/create-flare-stack verify:planner
bun run --cwd packages/create-flare-stack verify:packed
bun run --cwd packages/create-flare-stack verify:fixtures --flare-package C:/absolute/path/to/flare-0.14.1.tgz
```

The three initial combinations have passed real installation, setup, checks, and builds on Windows. Packed-generator fixtures verify template resolution outside the workspace, including secret ignore files.

The toolchain pins Oxfmt 0.70.0, Oxlint 1.85.0, oxlint-tsgolint 7.0.2003, and TypeScript 7.0.2. macOS and Linux execution remain release gates. Unrendered packaged templates are checked through generated-project fixtures; the reference app and generated projects retain strict shadcn rules.

See [the distribution plan](docs/github-distribution-plan.md) for architecture rationale and verification details. GitHub distribution supersedes registry-based entrypoints; the original specification remains unchanged for traceability.

## Cloudflare acceptance

The canonical reference application is deployed and verified live on Cloudflare Workers:

- **Live URL**: [https://flare-reference-web.kojowap.workers.dev/](https://flare-reference-web.kojowap.workers.dev/)
- **Health Check**: [https://flare-reference-web.kojowap.workers.dev/health](https://flare-reference-web.kojowap.workers.dev/health) (HTTP 200, `{ ok: true }`)
- **Remote D1**: Production database `flare-reference-web-production` with Drizzle ORM migrations applied.
- **Authentication**: Better Auth with dynamic origin allowlist and D1 database rate-limiting counters.

To provision, migrate, and deploy to your Cloudflare account:

```powershell
# 1. Authenticate with Cloudflare
bun x wrangler login

# 2. Configure remote resources, hosts, and secrets
bun run flare setup cloudflare --public-host <your-worker>.<subdomain>.workers.dev --preview-host *-(your-worker>.<subdomain>.workers.dev

# 3. Apply remote migrations
bun db:migrate:prod

# 4. Deploy production Worker
bun deploy
```

The normative design is [the Markdown v0.14.1 spec](docs/flare-stack-spec-v0.14.1.md). Its JSON companion describes the same intended full roadmap. [The implementation plan](docs/implementation-readiness-plan.md) records the approved narrower delivery sequence. [The implementation status](docs/implementation-status-v0.14.1.md) separates completed local evidence from remaining release work.
