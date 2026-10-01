---
name: neon
description: Neon Postgres database conventions, request-scoped pool lifecycle, withDb helper, and migrations in Flare Stack.
---

# Neon Postgres Skill

## Architecture

1. **Schema & Client**: Managed in `packages/db` via Drizzle ORM (`drizzle-orm/neon-serverless` with `@neondatabase/serverless`).
2. **Request Lifecycle**: Database clients are strictly request-scoped. Never maintain a `Pool` or `Client` in module-level global state. Use the `withDb(env, ctx, run)` scoped helper. Cleanup is scheduled via `ctx.waitUntil(pool.end())` in a `finally` block after the request handler settles.
3. **Better Auth Integration**: Uses Drizzle adapter with `provider: "pg"` and request-scoped database access. Supports interactive session transactions.
4. **Environment Isolation**:
   - Local: uses non-production database/branch configured in `DATABASE_URL` in `.dev.vars`.
   - Preview: uses isolated preview branch/database configured in `DATABASE_URL` in `.preview.vars`.
   - Production: uses production database/branch.
5. **Production Preflight & Destructive Guard**: Production migrations verify pending migrations using a build-only `MIGRATION_STATUS_DATABASE_URL` secret. Destructive statements (`DROP`, `RENAME`) require explicit `--allow-destructive`.

## Commands

- `bun db:generate` - Generate PostgreSQL migrations from schema
- `bun db:migrate` - Apply migrations to development database (from `.dev.vars`)
- `bun db:migrate:preview` - Apply migrations to preview branch (from `.preview.vars`)
- `bun db:migrate:prod` - Apply migrations to production database (guarded against destructive ops)
- `bun db:status` - Check migration status for environment
- `bun db:seed` - Seed database with initial records
- `bun db:reset` - Reset development database and re-apply migrations
