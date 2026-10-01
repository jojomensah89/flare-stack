# Web Application Instructions (`apps/web`)

This workspace is the standalone Flare `app` reference: TanStack Start, React 19, Cloudflare Workers, D1, and Better Auth.

## Framework and UI

- Routes use TanStack Router file-based routing under `src/routes/`.
- Worker entry and response policy live in `src/server/entry.ts` and `src/server/security.ts`.
- Use `@repo/ui` and Tailwind CSS v4; check the shared package before adding a duplicate primitive.
- Do not add a Service Binding to `apps/server`; the separate fullstack server preset is deferred.

## Authentication and environment

- D1-backed Better Auth lives in `src/server/auth.ts`; route checks live in `src/routes/api/auth/$.ts`.
- `BETTER_AUTH_SECRET`, `AUTH_ALLOWED_HOSTS`, and `AUTH_PROTOCOL` are required. There is no development-secret or host fallback.
- Local development must use `CLOUDFLARE_ENV=development`, which selects the isolated local D1 binding and `http` origin.
- Production and Preview use `https`. Setup must write the actual public host allowlist; Preview may use only the worker-scoped wildcard resolved from the Cloudflare account.
- Never trust forwarded host or protocol headers. Keep `advanced.trustedProxyHeaders` disabled.
- Do not hand-edit generated Cloudflare binding types.

## Logging and response headers

- Server requests use evlog through the Worker entry. Preserve `cf-ray` or `x-request-id` as the response request ID.
- Do not log raw exception messages/stacks, credentials, cookies, auth tokens, or query values.
- `security.ts` defines the baseline headers for both Worker responses and the generated static `_headers` file. Preview adds `X-Robots-Tag: noindex, nofollow`; do not add HSTS without a reviewed HTTPS-only rollout.

## Commands

- `bun run build`: build the web client and Worker bundle.
- `bun run typecheck`: type-check this app.
- Root `bun dev` selects the Wrangler `development` environment.
