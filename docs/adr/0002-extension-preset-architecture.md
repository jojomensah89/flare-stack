# ADR 0002: Browser Extension Preset Architecture (WXT + React)

## Status

Accepted

## Context

Phase 6 of the Flare Stack v0.14.1 specification defines a first-class browser `extension` preset built with WXT (Next-gen Web Extension Framework), React 19, TypeScript, Tailwind CSS v4, and shared UI primitives (`@repo/ui`).

Per the v0.14.1 specification:

1. **Extension-Only in v1**: The extension preset is client-only. It has no Cloudflare backend deployable and never scaffolds `apps/server`.
2. **No Database**: Extension storage uses browser storage APIs (`chrome.storage` / `browser.storage`); `--db d1` and `--db neon` are rejected with explanatory remediation.
3. **No Session Auth**: Better Auth cookie sessions require server origins. `--auth better-auth` is rejected with remediation directing the user to a companion `worker` or `fullstack` project.
4. **Lifecycle**: Extensions do not deploy via `bun deploy` to Cloudflare. Instead, `bun run build` compiles browser-compatible bundles and `bun package` produces zip archives for Chrome Web Store, Firefox Add-ons, and Edge Add-ons distribution.

## Decision

We introduce the `extension` preset into Flare Stack with the following architectural components:

### 1. Template Layer: `extension/common`

- Directory: `packages/create-flare-stack/templates/0.14.1/extension/common/`
- Workspace shape:
  - `apps/extension/`:
    - `entrypoints/`:
      - `popup/`:
        - `index.html`: Entrypoint HTML for the extension toolbar action popup.
        - `main.tsx`: React 19 mount point.
        - `App.tsx`: Modern extension popup interface using `@repo/ui` components (Card, Button, Badge) with status toggle and link to docs.
        - `style.css`: Modern Tailwind v4 / `@repo/ui` styles.
      - `background.ts`: Manifest V3 service worker entrypoint with runtime install listener.
    - `wxt.config.ts`: WXT configuration setting manifest permissions, name, description, and module plugins.
    - `package.json`: Extension workspace manifest defining `dev`, `build`, `zip`, `typecheck`.
    - `tsconfig.json`: TypeScript configuration extending `@repo/config`.
    - `components.json`: shadcn UI configuration for extensions.
    - `AGENTS.md`: Extension workspace instructions.
  - Root overrides:
    - `package.json`: Root scripts updated so `bun dev` runs WXT development mode, `bun run build` runs turbo build, and `bun package` runs `bun --filter @repo/extension zip`.
    - `scripts/dev.ts`: Launches WXT extension dev server.
    - `scripts/setup.ts`: Configures git hooks and format checks (skipping Cloudflare wrangler types).

### 2. Generator Plan & Materialization

- Update `packages/create-flare-stack/src/model.ts`: add `"extension"` to `Preset`.
- Update `packages/create-flare-stack/src/args.ts`:
  - Allow `--preset extension`.
  - Reject `--auth` with message explaining session auth is unsupported in browser extensions.
  - Reject `--db d1` and `--db neon` with message explaining databases are unsupported in browser extensions.
- Update `packages/create-flare-stack/src/plan.ts`:
  - Layer sequence for extension: `["base", "extension/common"]`.
- Update `packages/create-flare-stack/src/materialize.ts`:
  - Assert existence of `apps/extension`.
  - Assert absence of `apps/web` and `apps/server`.

### 3. Flare CLI Lifecycle Commands

- `packages/flare/src/project.ts`:
  - Allow `"extension"` preset in project model.
  - Mark project as non-Cloudflare deployable.
- `packages/flare/src/commands/deploy.ts`:
  - If preset is `"extension"`, refuse with clear error: `The extension preset is a client-side browser extension and has no Cloudflare deployment. Run 'bun run build' or 'bun package' to create the extension zip package.`
- `packages/flare/src/commands/preview.ts`:
  - If preset is `"extension"`, refuse with matching clear error.
- `packages/flare/src/commands/db.ts`:
  - Refuse if preset is `"extension"` (`extension preset has no database`).
- `packages/flare/src/setup.ts`:
  - Complete local git hooks and environment preparation without requiring Cloudflare Wrangler login or binding types.

### 4. Verification Harness

- `packages/create-flare-stack/scripts/verify-planner.ts`: Assert `extension` maps to `["base", "extension/common"]`.
- `packages/create-flare-stack/scripts/verify-packed.ts`: Test `packed-extension` generation and verify key files (`wxt.config.ts`, `apps/extension/entrypoints/popup/App.tsx`, absence of `apps/web`).
- `packages/flare/scripts/verify-lifecycle.ts`: Test fail-safe rejection of `deploy`, `preview`, and `db` for extension preset.

## Consequences

- First-class support for browser extension authoring with modern WXT and React 19.
- Clean design parity: shared `@repo/ui` and `@repo/config` are reused across web apps, workers, and extensions.
- Zero confusion over backend hosting: extensions are strictly client-side in v1.
