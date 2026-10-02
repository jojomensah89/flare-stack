# Flare Stack project instructions

Use Bun for package operations. Run `bun check` before finishing code changes and `bun run build` to verify the production Worker build. Do not add a test framework unless the project explicitly chooses one.

This project targets Cloudflare Workers. Use the generated Cloudflare bindings and never hand-edit `worker-configuration.d.ts`. Use `evlog` for server-side structured logs and never log secrets. Use the shared `@repo/ui` package and shadcn conventions for interface components.

The selected database and authentication profile are recorded in `flare.config.ts`. Load the matching project skills from `.agents/skills` before changing those areas.

## Skills Guide

Task-specific procedures live under `.agents/skills`. Agents must load the matching skill before starting work in a given domain:

| Task / Domain                      | Skill to Use                  | Purpose                                                                       |
| ---------------------------------- | ----------------------------- | ----------------------------------------------------------------------------- |
| **Logging conventions**            | `evlog`                       | Server-side structured logging and wide-event standards                       |
| **Component primitives**           | `shadcn`                      | Monorepo component structure and shadcn conventions                           |
| **UI token enforcement**           | `shadcn-lint`                 | Token consistency and preventing ad-hoc style suppressions                    |
| **Typed backend & error handling** | `effect`                      | Functional business logic, typed errors, and Hono integration via `runEffect` |
| **Routing & server functions**     | `tanstack-start`              | TanStack Start route trees, loaders, and server functions                     |
| **Edge runtime & bindings**        | `cloudflare-workers`          | Cloudflare Workers execution model, bindings, and compatibility flags         |
| **Workspace architecture**         | `flare-project` / `flare-web` | Flare Stack monorepo conventions and web surface workflows                    |
