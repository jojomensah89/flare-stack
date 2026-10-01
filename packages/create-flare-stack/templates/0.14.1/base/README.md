# {{PROJECT_NAME}}

A Flare Stack application on TanStack Start, React, and Cloudflare Workers.

Use Bun throughout:

```sh
bun setup
bun dev
bun check
bun run build
bun preview
```

`bun setup` prepares local Cloudflare state, installs Git hooks when available, and generates Cloudflare types. Edit `apps/web/wrangler.jsonc` for Worker configuration. Keep credentials in ignored local variable files and configure production secrets through Cloudflare.

The generated profile is recorded in `flare.config.ts`. `bun deploy` invokes Flare's Cloudflare deployment workflow; review the target environment before running it.
