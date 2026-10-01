# Server Worker Instructions

This workspace contains the dedicated Hono API worker for the Flare Stack fullstack architecture.

## Runtime

- Targets Cloudflare Workers with `nodejs_compat`.
- Private service: `workers_dev: false` and `preview_urls: false`.
- Receives traffic via Cloudflare Service Binding from `apps/web` or direct internal service calls.

## API Structure

- Entrypoint: `src/index.ts`.
- Routes live under `src/routes/` and are mounted with `.basePath("/api")`.
- Export `AppType` from `src/index.ts` and `src/contract.ts` for type-safe Hono RPC in `apps/web`.

## Commands

- `bun dev` - run local worker
- `bun run build` - verify build
- `bun run typecheck` - type check
