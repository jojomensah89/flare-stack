# Web application

This frontend uses {{FRONTEND_LABEL}} on Cloudflare Workers. File routes live in `src/routes`; server-state queries and mutations use the standard fetch client in `src/lib/api-client.ts` and browser-safe Zod DTOs from `@repo/shared/api`.

Use shared `@repo/ui` components, Base UI, Tailwind v4, and CSS variable theme tokens. The web Worker forwards same-origin `/api/*` requests through its `SERVER` Service Binding. Do not import the server runtime, database packages, or auth secrets here. Database and Better Auth operations belong to `apps/server`.

Run `bun check` and `bun run build` from the repository root. Never edit generated Cloudflare binding types by hand.
