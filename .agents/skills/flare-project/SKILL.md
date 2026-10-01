---
name: flare-project
description: General instructions and invariants for working inside a Flare Stack project.
---

# Flare Project Skill

## Core Principles

1. **Package Manager**: Always use `bun`. Use `bun run build`, never bare `bun build`.
2. **Quality Gate**: Run `bun check` before completing any task.
3. **Quality Tools**: Oxfmt formats source; Oxlint handles linting and hosts `@shadcn/lint`; TypeScript remains the compiler gate.
4. **No Testing Bloat**: Do not introduce unit or browser testing frameworks unless explicitly requested.
5. **Cloudflare Deployment**: Configuration is stored in `wrangler.jsonc` and managed with `flare` / `wrangler`.
6. **Observability**: Server logs must use `evlog` structured events. Never log credentials or secrets.
