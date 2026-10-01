---
name: d1
description: Cloudflare D1 database conventions, migrations, local persistence, and preview isolation.
---

# Cloudflare D1 Skill

## Architecture

1. **Schema & Client**: Managed in `packages/db` via Drizzle ORM (`drizzle-orm/d1`).
2. **Canonical Local Persistence**: Local development and local migrations share root `.wrangler/state`. The Cloudflare Vite plugin specifies `persistState: { path: "../../.wrangler/state" }`.
3. **Preview Isolation**: Preview environment uses isolated D1 database defined in `previews.d1_databases` and `env.preview.d1_databases`. Preview migrations never touch production.
4. **Production Preflight**: Production deployment enforces a mandatory remote migration preflight. Deployments are blocked if unapplied migrations are pending.
5. **Destructive Operations**: Production migrations automatically scan SQL files for destructive statements (`DROP`, `RENAME`) and require `--allow-destructive` acknowledgement.

## Commands

- `bun db:generate` - Generate SQL migrations from schema
- `bun db:migrate` - Apply migrations to local `.wrangler/state`
- `bun db:migrate:preview` - Apply migrations to preview database
- `bun db:migrate:prod` - Apply migrations to production database (guarded against destructive ops)
- `bun db:status` - Check migration status
- `bun db:seed` - Seed local database with initial records
- `bun db:reset` - Clear local `.wrangler/state` and re-apply migrations
