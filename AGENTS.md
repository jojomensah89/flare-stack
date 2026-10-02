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
- `bun db:studio` - visual Drizzle Studio database browser

## Architecture

Read the workspace-specific AGENTS.md before modifying a deployable app.

## Template Overlays & Scaffolding

- Files under `packages/create-flare-stack/templates/` are partial, unrendered overlay slices.
- Do not evaluate template slices as standalone monorepo packages; verify them via `bun run test` or verification scripts (`verify-fixtures.ts`, `verify-lifecycle.ts`).
- When defining presets or recipes, always enumerate the complete tech stack explicitly (runtime, framework, auth, database, tooling).
- Always run `bun run format` after modifying template slices or recipe registries.

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

## Skills Guide

Task-specific procedures live under `.agents/skills`. Project-level craft, animation, UI selection, and log-analysis skills are packaged with `create-flare-stack` and installed when starting a new project. Agents must load the matching skill before starting work in a given domain:

| Task / Domain                      | Skill to Use                   | Purpose                                                                        |
| ---------------------------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| **Logging review & patterns**      | `review-logging-patterns`      | Auditing code for logging best practices, wide events, and evlog adoption      |
| **Log analysis & debugging**       | `analyze-logs`                 | Analyzing NDJSON log events in `.evlog/logs/` to diagnose errors and latencies |
| **Logging conventions**            | `evlog`                        | Server-side structured logging and wide-event standards                        |
| **Design engineering & craft**     | `emil-design-eng`              | UI polish, component craftsmanship, animation philosophy, and micro-details    |
| **Visual polish & accessibility**  | `better-ui`                    | Concentric borders, surface depth, hit areas, optical alignment, and contrast  |
| **Selecting UI libraries**         | `pick-ui-library`              | Curated recommendations for charts, command menus, toasts, virtualization      |
| **Finding animation spots**        | `find-animation-opportunities` | Identifying static UI areas that would benefit from subtle motion              |
| **Refining motion & physics**      | `improve-animations`           | Auditing and tuning animation timing, springs, and transitions                 |
| **Component primitives**           | `shadcn`                       | Monorepo component structure and shadcn conventions                            |
| **UI token enforcement**           | `shadcn-lint`                  | Token consistency and preventing ad-hoc style suppressions                     |
| **Typed backend & error handling** | `effect`                       | Functional business logic, typed errors, and Hono integration via `runEffect`  |
| **Routing & server functions**     | `tanstack-start`               | TanStack Start route trees, loaders, and server functions                      |
| **Edge runtime & bindings**        | `cloudflare-workers`           | Cloudflare Workers execution model, bindings, and compatibility flags          |
| **Database operations**            | `d1` / `neon`                  | Schema migrations, connection pooling, and Drizzle ORM queries                 |
| **Authentication & sessions**      | `better-auth`                  | Auth configuration, dynamic baseURL, D1 rate limiting, and client helpers      |
| **Workspace architecture**         | `flare-project` / `flare-web`  | Flare Stack monorepo conventions and web surface workflows                     |
