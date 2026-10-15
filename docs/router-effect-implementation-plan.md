# Router, Effect, and builder implementation

Approved scope: [proposal](react-router-spa-proposal.md). Draft PR: https://github.com/jojomensah89/flare-stack/pull/15.

## Work packets

1. Shared UI: repair shadcn configuration, theme inheritance and tokens, tooltip and menu/dialog composition, and generated animation drift. Own source UI and corresponding base template only.
2. Generator: add the Router frontend and browser-safe catalog/commands, replace newly generated fullstack Hono RPC with HTTP + Effect and Query, update all 19 profiles and generated docs/fixtures. Own generator except shared UI template/configs.
3. Website: dedicated `apps/site`, simple landing and integrated preset builder consuming the shared catalog. Own site files; preserve reference app.
4. Lifecycle/integration: role-aware database, local/remote secrets, hosts, setup/types/doctor; workspace dependencies and lint coverage; root docs and verification.

One writer per file set. Workers implement directly without delegation; coordinator owns dependencies, integration, commits, and PR updates. Independent review follows implementation.

## Verification sequence

- Focused UI schema and generator/catalog fixtures.
- CLI lifecycle fixtures covering fullstack server resource ownership and preview isolation.
- `bun check`, production builds, generated-project install/setup/check/build with local archives, and existing local auth/runtime fixtures.
- Browser checks for the website, copy behavior, valid/invalid selections, mobile and desktop themes, and representative generated auth/data flows.
- `git diff --check`, independent review, final targeted fixes, commit and push to the draft PR with exact evidence and remaining limitations.

No release publication, remote resource mutation, merge, or production deployment is part of this implementation. Existing unrelated AGENTS.md edits and the untracked v1 roadmap stay untouched.

## Implementation evidence — 15 October 2026

Implemented the Router/Start fullstack split, Effect services behind thin Hono HTTP routes, shared Zod DTOs, Query examples, role-aware lifecycle operations, shared UI corrections, and `apps/site`. The revised landing follows the supplied parchment reference with an original ASCII flame, native HTML selects, and the shared 19-combination command catalog. The requested taste skill is installed locally.

Local validation:

- `bun check` and root production builds pass; existing auth, runtime, Neon helper, and fullstack reference checks pass.
- All 19 profiles pass static materialization. Generated install/setup/check/build checks cover all 19 across focused runs; the two Start profiles that initially failed the empty-secrets requirement passed after correction. Packed generator checks include an installed extension and Chrome/Firefox/Edge packages. Loopback archive distribution checks pass.
- All six lifecycle suites pass, including private backend resource ownership, preview isolation, artifact preflight, account parity, and paired operations. No remote operation is performed by these fixtures.
- Independent review caught missing private-worker flags and auth host placeholders in the final Neon overlays. The configs are corrected; generated-profile assertions now verify private production/preview Workers and exercise host patching against the actual final overlaid configs.
- A generated Router + D1 + auth project passed local migration and browser item read/write, signup, session after reload, and signout. Additional generated-runtime checks cover typed errors, defects, sanitized output, scoped cleanup, malformed input, client response validation, HTTP errors, and cancellation.
- Site browser checks cover native selections, all combinations, invalid names, copy feedback/clipboard, source/release gating, and responsive widths 390/768/1440 without horizontal overflow. Shared dialog/menu/tooltip keyboard checks pass. The final attempt to reopen the browser for another screenshot was blocked by browser policy; no further browser proof is claimed after the last copy/accessibility text fixes. React Doctor reports 100/100 and the taste source check reports zero failures/warnings.

These are local checks, not live Cloudflare or Neon acceptance. Cross-platform CI for the pushed implementation remains a separate gate. The existing preview workflow requires a Cloudflare token, which is unavailable in this environment. The published v0.14.1 artifacts still contain only the three verified app profiles; Router/Effect and the expanded source matrix are unreleased. The PR remains a draft pending review and release decisions. No package publication, merge, or production deployment occurred.
