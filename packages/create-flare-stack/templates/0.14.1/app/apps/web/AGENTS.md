# Web application instructions

This app uses TanStack Start with React 19 and runs on Cloudflare Workers through the Cloudflare Vite plugin. Routes live in `src/routes`; use the shared `@repo/ui` package for interface components and Tailwind CSS v4 tokens for styling.

Use Cloudflare's generated bindings and never edit `worker-configuration.d.ts` by hand. Keep server handlers compatible with the Workers runtime and use the `@repo/observability` helpers for structured logs.

Run `bun run build` from the repository root to verify the production Worker bundle.
