# `@repo/server` Fullstack Worker Fixture

This private Hono Worker is retained for the future `fullstack` preset. The active reference preset is standalone `app`; its Wrangler config has no Service Binding to this Worker.

## Architecture

- Runtime: Cloudflare Workers with Hono. Routes mount under `/api`.
- `src/index.ts` exports the composed Hono `app` for typed RPC/request fixtures, plus a default evlog-instrumented Worker entry.
- Production must keep `workers_dev` and `preview_urls` disabled so this Worker remains private when the fullstack topology is enabled.
- Authentication is statically D1-backed through Better Auth. Do not select Neon dynamically from a `DATABASE_URL`; Neon remains a separate explicit profile/helper.
- `AUTH_ALLOWED_HOSTS`, `AUTH_PROTOCOL`, and `BETTER_AUTH_SECRET` are required. Do not trust forwarded host or protocol headers.
- Preserve `cf-ray` or validated `x-request-id` across the response and log requests through evlog.

## Commands

- `bun run typecheck`: type-check this Worker.
- `bun run deploy`: available only when the fullstack preset and private Service Binding topology are enabled by the generated project.
