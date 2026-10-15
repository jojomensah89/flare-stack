# Flare Stack

A personal Cloudflare-first TypeScript starter for getting from an idea to a working application quickly. Bun, Cloudflare Workers, Drizzle, Better Auth, and shared Base UI/Tailwind components are the fixed foundations.

## Source and release status

The published [v0.14.1 release](https://github.com/jojomensah89/flare-stack/releases/tag/v0.14.1) contains three generator profiles: app without a database, app with D1, and app with D1 + Better Auth. Its public HTTPS D1/auth scaffold has been exercised through installation, setup, quality checks, and production build on Windows.

This branch adds the approved [Router and Effect revision](docs/react-router-spa-proposal.md). These changes are source-only until a matching generator and Flare CLI release is published. Existing projects are not automatically migrated.

| Project shape | Frontend                               | Backend                                 | Database/auth combinations         |
| ------------- | -------------------------------------- | --------------------------------------- | ---------------------------------- |
| app           | React + TanStack Start                 | Start server functions/routes           | none, D1, D1/auth, Neon, Neon/auth |
| fullstack     | React + TanStack Start + Query         | Thin Hono HTTP routes + Effect services | none, D1, D1/auth, Neon, Neon/auth |
| fullstack     | React + Vite + TanStack Router + Query | Thin Hono HTTP routes + Effect services | none, D1, D1/auth, Neon, Neon/auth |
| worker        | none                                   | Hono Worker                             | none, D1, Neon; no browser auth    |
| extension     | WXT + React + Tailwind                 | none                                    | none; no browser auth              |

That is 19 source combinations. All server profiles target Cloudflare Workers; database profiles use Drizzle. Web templates use shared Base UI primitives, Tailwind v4, and CSS-variable theme tokens. All use Bun and the Flare CLI. Neon and the worker/extension shapes retain experimental status; local fixture results do not establish live-provider acceptance.

New fullstack projects use standard same-origin fetch and shared Zod DTO schemas instead of Hono RPC. TanStack Query owns browser server state. The web Worker forwards `/api/*` through a private Service Binding; database connections, Better Auth, and secrets belong to the server Worker. Paired persistent preview Workers keep preview bindings separate from production.

## Scaffold an application

The verified published D1 + Better Auth path:

```powershell
bunx --bun --package https://github.com/jojomensah89/flare-stack/releases/download/v0.14.1/create-flare-stack-0.14.1.tgz create-flare-stack my-app --preset app --db d1 --auth
```

New source profiles run from this checkout with the matching source lifecycle CLI:

```powershell
bun install
bun ./packages/create-flare-stack/bin/create-flare-stack.ts my-app --preset fullstack --frontend router --db d1 --auth --flare-package ./packages/flare
```

Do not pass new source options to the old release archive. The standalone builder in `apps/site` lists every combination, validates names and choices, and copies either an available release command or an explicit local-checkout command.

```powershell
bun run --cwd apps/site dev
```

## Reference development

```powershell
bun install
bun setup
bun db:migrate
bun dev
bun check
bun run build
```

The existing reference/demo app remains in `apps/web`; the new landing page lives separately in `apps/site`. Setup creates ignored local environment files and generates Cloudflare types. Local D1 operations share the canonical `.wrangler/state` directory.

## Verification and distribution

```powershell
bun run --cwd packages/flare verify
bun run --cwd packages/create-flare-stack verify:planner
bun run --cwd packages/create-flare-stack verify:packed
bun run --cwd packages/create-flare-stack verify:fixtures --flare-package C:/absolute/path/to/flare-0.14.1.tgz
bun run test:auth
bun run test:fullstack
bun run test:neon
bun run test:runtime
bun run release:prepare
bun run test:distribution
```

Generator fixtures verify rendered projects rather than treating unrendered overlay slices as packages. The reference `test:fullstack` script exercises the preserved Hono prototype; it is not evidence for the newly generated Effect backend. No command above establishes deployment, clean-account acceptance, or cross-platform coverage by itself.

The [implementation plan](docs/router-effect-implementation-plan.md) records the current change and checks. The [specification](docs/flare-stack-spec-v0.14.1.md) and its JSON companion include the intentional source revision and release boundary. The older [implementation status](docs/implementation-status-v0.14.1.md) is historical evidence, not a manifest of what the published archive contains.

Recipes, registry composition, upgrades, and wider lifecycle work remain separate from this Router/Effect implementation. Publishing a release and deploying the site require separate release approval.
