# Project instructions

This repository was generated with Flare Stack.

## Package manager

Use Bun. Do not replace Bun commands with npm, pnpm, or yarn.
When a package script name collides with a Bun built-in, use `bun run <script>`. In particular, use `bun run build`, never `bun build`. Generated projects do not define `bun test`; do not add a test framework unless the project explicitly chooses one.

## Commands

- `bun dev` - run local development
- `bun check` - required quality gate
- `bun run build` - production build
- `bun preview` - safe remote preview
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

This project uses the Cloudflare D1 profile managed via Drizzle ORM in `packages/db`.
Local migrations apply to the canonical `.wrangler/state`. Production deployments enforce a mandatory remote migration preflight. Run `bun db:migrate` locally.

## Authentication

This project uses Better Auth configured with Cloudflare D1 via Drizzle ORM.

- Server configuration lives in `apps/web/src/server/auth.ts`.
- Dynamic `baseURL` uses `AUTH_ALLOWED_HOSTS` and explicit `AUTH_PROTOCOL` (never static `BETTER_AUTH_URL`).
- Rate limiting is explicitly enabled with `storage: "database"`, `cf-connecting-ip`, and `/get-session` exemption to protect D1 write quotas.
- Client consumption uses `apps/web/src/lib/auth-client.ts`.

## Quality gate

Before finishing a code change, run `bun check`; run any project-specific tests only if that project has chosen to add them.

## Skills

Task-specific procedures live under `.agents/skills`. Load the matching skill when modifying Cloudflare resources, UI, or TanStack Start code.
