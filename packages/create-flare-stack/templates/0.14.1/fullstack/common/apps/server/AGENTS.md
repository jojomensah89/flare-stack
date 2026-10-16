# Server Worker Instructions

This workspace contains the dedicated Hono API worker for the Flare Stack fullstack architecture.

## Runtime

- Targets Cloudflare Workers with `nodejs_compat`.
- Private service: `workers_dev: false` and `preview_urls: false`.
- Receives traffic via Cloudflare Service Binding from `apps/web` or direct internal service calls.

## API Structure

- Entrypoint: `src/index.ts`.
- Routes live under `src/routes/` and are mounted with `.basePath("/api")`.
- Keep business logic in Effect services and use `runEffect` for scoped execution from thin Hono HTTP routes. D1 uses request bindings; Neon pools must close after success and failure.
- Define browser-safe Zod request/response DTOs in `packages/shared/src/api.ts`. Do not export Hono app types or server runtime into the web workspace.

## Commands

- `bun dev` - run local worker
- `bun run build` - verify build
- `bun run typecheck` - type check
