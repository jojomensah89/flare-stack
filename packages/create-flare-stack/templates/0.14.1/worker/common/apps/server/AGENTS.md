# Server Worker Instructions

This workspace contains the standalone Hono server Worker for Cloudflare Workers.

## Entry Point

- Application and routes live in `src/index.ts`.
- Environment types and Cloudflare bindings live in `src/env.ts`.

## Verification

- Local typecheck: `bun --filter @repo/server typecheck`
- Local dev: `bun --filter @repo/server dev`
- Health endpoint: `GET /health` returns `{"ok": true}`.
