# {{PROJECT_NAME}}

Cloudflare Workers with {{FRONTEND_LABEL}}, Hono HTTP routes, Effect services, and Bun/Flare tooling. Database: `{{DATABASE}}` with Drizzle where selected. Authentication: `{{AUTH}}`. Shared Base UI components use Tailwind v4 and CSS-variable theme tokens.

`apps/web` is the public frontend. It forwards `/api/*` to the private `apps/server` Worker through a Service Binding. Both depend on browser-safe Zod DTOs in `packages/shared`. TanStack Query owns browser server state; no Hono RPC client or server runtime ships to the browser.

```sh
bun setup
bun db:migrate # D1 profiles only; local canonical .wrangler/state
bun dev
bun check
bun run build
```

With no database, the example checks API health; it does not invent persistent item storage. Database-backed examples list and add public sample items. Better Auth, when selected, provides a separate signup/session/signout example. Protect or replace the sample item routes before using them for private product data.

Local auth/Neon secrets live in ignored `apps/server/.dev.vars`; preview values live in `apps/server/.preview.vars`. The web Worker receives no database or auth secrets. Neon uses request-scoped pools and requires a reachable database for real queries; local build fixtures do not establish provider acceptance.

Configure remote resources and public auth hosts with `flare setup cloudflare` before deployment. Review generated Wrangler configs and run remote migrations explicitly. `bun preview` uses one persistent preview pair; concurrent branches share it. `bun deploy` builds and deploys server before web after artifact checks. Do not use per-branch Worker Preview bindings for this topology.

This source revision requires its matching Flare CLI; it is not the output of the older published v0.14.1 generator archive. Existing applications are not migrated automatically.
