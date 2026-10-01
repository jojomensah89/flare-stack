# Flare Stack project instructions

Use Bun for package operations. Run `bun check` before finishing code changes and `bun run build` to verify the production Worker build. Do not add a test framework unless the project explicitly chooses one.

This project targets Cloudflare Workers. Use the generated Cloudflare bindings and never hand-edit `worker-configuration.d.ts`. Use `evlog` for server-side structured logs and never log secrets. Use the shared `@repo/ui` package and shadcn conventions for interface components.

The selected database and authentication profile are recorded in `flare.config.ts`. Load the matching project skills from `.agents/skills` before changing those areas.
