# ADR 0001: Standalone Worker Preset Architecture

## Status

Accepted

## Context

Flare Stack v0.14.1 currently supports `app` (TanStack Start frontend) and `fullstack` (TanStack Start frontend + Hono backend worker connected via Cloudflare Service Bindings).
Phase 6 of the Flare Stack specification calls for a standalone `worker` preset for non-web workloads:

- APIs
- MCP servers
- Webhook receivers
- Scheduled background jobs
- Microservices

In v1, standalone workers:

1. Do not include a frontend (`apps/web` is absent).
2. Use Hono on Cloudflare Workers with structured `evlog` logging.
3. Expose a verified `/health` endpoint returning `{"ok": true}`.
4. Support optional database backends (`none`, `d1`, or `neon`).
5. Do not include Better Auth web session cookies (cookie session auth requires web origins; `worker` preset rejects `--auth` with remediation).

## Decision

We introduce the `worker` preset into Flare Stack with the following architectural components:

### 1. Template Layer: `worker/common`

- Directory: `packages/create-flare-stack/templates/0.14.1/worker/common/`
- Contents:
  - `apps/server/`: Standalone Hono Worker.
    - `src/index.ts`: Hono application with `requestId` extraction, structured evlog logging, error boundary, and `/health` route.
    - `src/env.ts`: Cloudflare Worker environment and binding types.
    - `wrangler.jsonc`: Cloudflare Worker config with `workers_dev: true` for direct deployment.
    - `package.json`: Worker scripts (`dev`, `build`, `typecheck`).
    - `tsconfig.json`: Extends `@repo/config`.
  - `scripts/dev.ts`: Runs `wrangler dev` in `apps/server`.
  - `scripts/setup.ts`: Generates types and verifies bindings for `apps/server`.

### 2. Generator Plan & Materialization

- Update `packages/create-flare-stack/src/model.ts`: add `"worker"` to `Preset`.
- Update `packages/create-flare-stack/src/args.ts`: allow `--preset worker`, reject `--auth better-auth` with explanatory message.
- Update `packages/create-flare-stack/src/plan.ts`:
  - Layers: `["base", "worker/common"]`.
  - Database overlay: if `d1`, add `db/d1` and `worker/db-d1`; if `neon`, add `db/neon` and `worker/db-neon`.
- Update `packages/create-flare-stack/src/materialize.ts`:
  - Validate presence of `apps/server` and absence of `apps/web`.
  - Validate `wrangler.jsonc` at `apps/server/wrangler.jsonc`.

### 3. Flare CLI Lifecycle

- `packages/flare/src/project.ts`:
  - `loadProject`: locates `apps/server/wrangler.jsonc` when preset is `"worker"`.
- `packages/flare/src/commands/common.ts`:
  - Helper `workerDirectory(project)`: resolves to `apps/server` for `worker`, `apps/web` for `app`.
- `packages/flare/src/commands/deploy.ts`:
  - For `worker`: builds and deploys `apps/server` directly, verifies `/health`.
- `packages/flare/src/commands/preview.ts`:
  - For `worker`: uploads Worker Preview for `apps/server`, verifies `/health`.
- `packages/flare/src/commands/rollback.ts`:
  - For `worker`: rolls back `apps/server`, verifies `/health`.
- `packages/flare/src/commands/db/*.ts`:
  - Resolves wrangler config to `apps/server/wrangler.jsonc`.

### 4. Verification Harness

- Update `packages/flare/scripts/verify-lifecycle.ts` to test `worker` deploy, preview, and rollback.
- Update `packages/create-flare-stack/scripts/verify-planner.ts` to assert `worker` layer sequences.
- Add `worker` profile to distribution tests.

## Consequences

- Clean separation between web-first apps and headless workers.
- Zero extra dependencies or unused UI code in standalone worker projects.
- Consistent developer experience across `app`, `fullstack`, and `worker` presets using the unified `flare` CLI.
