---
name: cloudflare-workers
description: Cloudflare Workers best practices, runtime constraints, and bindings guidance.
---

# Cloudflare Workers Skill

## Guidelines

1. **Runtime**: Runs on V8 isolates (`workerd`). Node APIs are available through `nodejs_compat`.
2. **Configuration**: Use `wrangler.jsonc`. Never hand-edit `worker-configuration.d.ts`.
3. **Environment**: Server runtime variables and secrets are defined in `wrangler.jsonc` (for non-secret `vars`) and `.dev.vars` (for secrets).
4. **Static Assets**: Assets are configured via `assets` block in `wrangler.jsonc`.
5. **Observability**: `observability.enabled: true` in `wrangler.jsonc`. Use structured JSON in production for Cloudflare Workers Logs.
