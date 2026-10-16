# create-flare-stack

The Flare Stack scaffolder, with Bun installation, setup, formatting, quality checks, and production builds before a project is reported ready. Failed projects remain available for inspection and are clearly reported as unvalidated.

## Published release

The published v0.14.1 archives have three verified app profiles: no database, D1, and D1 with Better Auth. They do not contain the new Router/Effect implementation in this branch.

```powershell
bunx --bun --package https://github.com/jojomensah89/flare-stack/releases/download/v0.14.1/create-flare-stack-0.14.1.tgz create-flare-stack my-app --db d1 --auth
```

## Source implementation

This branch supports 19 combinations: five app, five fullstack Start, five fullstack Router, three worker, and one extension. Each web group supports no database, D1, D1 with Better Auth, Neon, or Neon with Better Auth. Workers support no database, D1, or Neon; extensions have no database or auth.

- App: TanStack Start, React, Cloudflare Workers, optional D1/Neon through Drizzle and Better Auth, Base UI, Tailwind CSS, Bun, Flare CLI.
- Fullstack: TanStack Start or TanStack Router with React, a separate Cloudflare Worker using thin Hono HTTP routes and Effect services, TanStack Query, shared Zod DTOs, optional D1/Neon through Drizzle and Better Auth, Base UI, Tailwind CSS, Bun, Flare CLI.
- Worker: Cloudflare Workers, Hono, optional D1/Neon through Drizzle, Bun, Flare CLI.
- Extension: WXT, React, Base UI, Tailwind CSS, Bun, Flare CLI.

From the repository root, use the matching local lifecycle CLI explicitly for fullstack projects:

```powershell
bun packages/create-flare-stack/bin/create-flare-stack.ts my-app --preset fullstack --frontend router --db d1 --auth --flare-package ./packages/flare
```

`--frontend start` is the fullstack default. `--frontend router` is valid only with `--preset fullstack`. The source fullstack implementation requires `--flare-package`; the published CLI does not implement its new resource ownership rules. Relative paths, absolute paths, and custom HTTP(S) archives are accepted as explicit CLI overrides. No unrelated local package is resolved implicitly.

The landing page's builder uses the same catalog and validation as the CLI. Release commands are enabled only for verified published profiles; source commands expose every supported source combination. No database disables auth. Experimental worker, extension, and Neon profiles remain outside the v1 golden path.
