---
name: better-auth
description: Better Auth conventions, dynamic base URL, Cloudflare D1 rate limiting, and session helpers in Flare Stack.
---

# Better Auth Skill

## Architecture & Conventions

Flare implements Better Auth with the following invariants:

1. **Database & Adapter**:
   - Backed by Cloudflare D1 via Drizzle ORM in `packages/db`.
   - Core tables: `user`, `session`, `account`, `verification`, and `rate_limit`.

2. **Dynamic Base URL (No static BETTER_AUTH_URL)**:
   - Configured via `baseURL.allowedHosts` derived from `AUTH_ALLOWED_HOSTS` (non-secret Wrangler var).
   - Protocol is explicitly set via `AUTH_PROTOCOL` (`http` locally, `https` on Cloudflare; never `auto`).
   - `advanced.trustedProxyHeaders` is left unset/false so forwarded headers cannot spoof the host.
   - Unknown hosts fail closed.

3. **Cloudflare Rate Limiting**:
   - `rateLimit.enabled: true` is explicitly configured.
   - `rateLimit.storage: "database"` persists counters across Cloudflare Workers isolates.
   - `customRules: { "/get-session": false }` exempts session reads from writing counter rows, protecting D1 row-write quotas.
   - `advanced.ipAddress.ipAddressHeaders: ["cf-connecting-ip"]` resolves trusted client IP addresses on Cloudflare.

4. **TanStack Start Integration**:
   - Uses `tanstackStartCookies()` plugin from `better-auth/tanstack-start`.
   - API splat handler lives in `apps/web/src/routes/api/auth/$.ts`.
   - React client lives in `apps/web/src/lib/auth-client.ts`.
   - Server session helpers live in `apps/web/src/server/session.ts`.

5. **Secrets & Environment**:
   - `BETTER_AUTH_SECRET`: at least 32-character high-entropy secret. Stored locally in `.dev.vars` and pushed as a secret in remote environments.
   - Non-secrets (`AUTH_ALLOWED_HOSTS`, `AUTH_PROTOCOL`) are stored in Wrangler `vars`.
