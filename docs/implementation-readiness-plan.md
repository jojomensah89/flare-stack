# Flare implementation readiness

Reviewed against the current checkout on 2026-10-01. This plan separates implemented code, recorded local evidence, and live-service acceptance. A fixture definition is not a passing run, and local validation does not establish deployed behavior. This documentation update did not run tests or change external resources.

## Current implementation

The generator contains `app`, `fullstack`, `worker`, and `extension` presets. Database overlays support `none`, D1, and Neon where applicable; Better Auth is available to database-backed web presets. The lifecycle CLI has topology-specific deploy, preview, rollback, and database paths for supported Cloudflare presets. Extension output is client-side and does not deploy to Cloudflare.

Local code support and local fixture coverage do not prove every profile works against real providers. The v0.14.1 implementation status records local Windows quality, generation, and lifecycle evidence, while identifying remote profile coverage and macOS/Linux execution as remaining release work.

The CLI currently implements D1 resource provisioning in `flare setup cloudflare`; Neon connection URLs are supplied by the project owner, and `flare db status` / `flare db migrate` use the configured environment URL. D1 and Neon `seed` and `reset` commands intentionally return explanatory errors: no seed data contract exists, and safe reset/recovery is not implemented. `flare deployments`, `flare resources`, and `flare upgrade` are also explicitly unsupported. Recipes, a public registry, and a public capability-composition surface are not implemented.

## Evidence and limits

| Area                                 | Evidence recorded or present in the checkout                                                                                                                                                                                                                                                                                                                                   | What it does not establish                                                                                                                                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Windows local quality and generation | The implementation status records successful Bun quality/build and disposable local profile fixtures. The fixture and verification scripts are present in the repository.                                                                                                                                                                                                      | This plan did not rerun those checks. Local fixtures do not prove live Cloudflare or Neon behavior.                                                                                                                                                          |
| Cloudflare + D1                      | The implementation status records a live reference `app` deployment using remote D1, production migrations, secret push, browser-verified item persistence, and Better Auth session creation. It also records an isolated Worker Preview deployment.                                                                                                                           | This is evidence for the exercised reference profile, not every generated topology or database combination.                                                                                                                                                  |
| Neon helper                          | `bun run test:neon` runs `scripts/verify-neon.ts`. That fixture replaces `Pool.prototype.end` and checks request-scoped pool lifetime and cleanup; it makes no Neon connection.                                                                                                                                                                                                | It is not a live Neon database test and does not prove a Neon-backed Cloudflare Worker, Neon migrations against a real branch, auth, or preview/production isolation. Live Cloudflare + Neon acceptance remains open.                                        |
| GitHub distribution                  | The status document records publication of the two v0.14.1 archives and a live HTTPS `bunx --package` smoke. The public [v0.14.1 release](https://github.com/jojomensah89/flare-stack/releases/tag/v0.14.1) is available. The repository's distribution fixture serves archives from loopback.                                                                                 | A loopback archive fixture is not a GitHub network test. The recorded command smoke does not establish a full clean-account Cloudflare deployment or cross-platform execution.                                                                               |
| Worker hostname discovery            | Current source contains account Workers-subdomain lookup for auth-enabled Cloudflare setup. It requires `CLOUDFLARE_API_TOKEN` with Workers Scripts Read permission and an account ID; explicit production and preview host overrides remain available. `packages/flare/scripts/verify-host-discovery.ts` defines mocked API, validation, override, and failure-path coverage. | The fixture source and implementation are not proof that the fixture passed. No successful Cloudflare account/API discovery run is recorded here; do not describe hostname discovery as verified until the fixture and an account-level smoke have evidence. |
| macOS and Linux                      | The current worktree defines a GitHub Actions quality matrix for Ubuntu, macOS, and Windows.                                                                                                                                                                                                                                                                                   | A workflow definition is not a successful run. No macOS/Linux execution result is recorded here, so cross-platform support remains a release gate.                                                                                                           |

## Release gates

1. Exercise the remaining generated profiles against remote Cloudflare, including `app` without a database, `app` with D1, `fullstack` with D1, and Neon-backed profiles. Neon acceptance must use distinct non-production preview and production test databases/branches, run migrations, and verify real Worker requests; include auth only for the auth-enabled profile. Do not treat the mocked helper fixture as this evidence.
2. Capture successful quality, build, generator, and lifecycle matrix runs on macOS and Linux. Keep the Windows result separate.
3. Run the hostname-discovery fixture and capture the account-level API result for a disposable or approved Cloudflare account. Verify that the resolved production host and Worker Preview pattern are written correctly, secrets are not exposed, and explicit overrides still work. Until then, describe the discovery implementation as present but unverified.

## Phase 7 gate

The normative v0.14.1 specification says not to start Phase 7 until the preset matrix is stable. Keep transactional recipes, the shadcn registry, capability composition, upgrades, deployment/resource history, and cleanup behind that gate. Planning these items is fine; do not mark them shipped or begin their release implementation while the required profile matrix is still open. Safe local D1 reset and seed remain separate deferred work with their own recovery and data-definition requirements.

## Local reproduction commands

The repository documents these local checks and disposable fixtures:

```powershell
bun check
bun run build
bun run test:neon
bun run test:fullstack
bun run test:distribution
bun run --cwd packages/flare verify
bun run --cwd packages/create-flare-stack verify:planner
bun run --cwd packages/create-flare-stack verify:packed
```

Running these commands can establish the corresponding local evidence only. Live Neon/Cloudflare acceptance, a successful GitHub Actions matrix run, and account-level hostname discovery must be recorded separately.
