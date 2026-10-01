# Flare implementation readiness

Approved direction: the user requested fixes and continued implementation after the repository/spec audit on 2026-09-30.

## First supported path

The canonical reference is a TanStack Start `app` with D1 and optional Better Auth. The initial generator supports `app` with no database, D1, or D1 plus auth. Fullstack, Neon, extension, worker, recipes, registry, upgrades, and coordinated rollback remain roadmap work until their release fixtures exist. Preserve useful reference code without advertising an unsupported preset as complete.

## Implementation

- Align the reference manifest, development command, tooling, documentation, and template versions with v0.14.1.
- Require explicit auth secret, host allowlist, and protocol; separate development, preview, and production config. Add the specified response headers and real structured evlog logging.
- Load validated lifecycle configuration, derive resource names, fail closed on deployment and migration checks, migrate remote preview resources, and implement local setup plus explicit remote provisioning and secret commands. Unsupported operations fail clearly instead of printing success.
- Replace Biome/ESLint with pinned Oxfmt/Oxlint, type-aware lint dependencies, and the shadcn JS plugin; retain TypeScript as the type gate. Windows execution is checked here; macOS/Linux stay release gates until independently exercised.
- Build a small versioned generator from curated templates and capability overlays, with strict destination validation and honest command failures.
- Replace database-mutating verification scripts with disposable local fixtures. Keep test framework dependencies out of generated projects.

## Verification

Run local fixture checks, root `bun check`, and `bun run build`. Generate and validate each initial supported combination. Use a fresh GPT-5.6 Sol High review to resolve implementation conflicts and verify the result. Local compilation and emulation are distinct from deployed Cloudflare, real Neon, browser-session, and clean-account acceptance evidence.

No deployment, remote resource creation, secret push, production migration, or existing database reset is performed during this implementation. Remote operations are implemented and locally verified through isolated fixtures; live acceptance remains a separate release step.
