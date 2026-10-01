# D1 database instructions

This workspace uses Cloudflare D1 through Drizzle ORM. Keep schemas in `src/schema`, generate migrations with `bun db:generate`, and apply local migrations with `bun db:migrate` before exercising database-backed routes.

Local D1 persistence is stored under the root `.wrangler/state`. Do not point local migrations at Preview or Production, and never hand-edit generated Cloudflare binding types.
