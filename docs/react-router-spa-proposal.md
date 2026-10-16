# Flare Stack: Router SPA, Effect backend, UI standards, and quick-start website

Status: approved for implementation; tracked in draft PR #15. Release publication and remote deployment remain separate approvals.
Reviewed: 2026-10-15.

User-confirmed direction: React + TanStack Router, TanStack Query, no Hono RPC, and Effect backend services with thin Hono HTTP routes. The prior Hono RPC recommendation is superseded.

Additional user requirements: Base UI + Tailwind with CSS-variable theming; fixes for the verified shadcn audit findings; a simple Rubik-inspired landing page with a Better-T-Stack-style section covering the preset combinations and a copyable scaffolding command. See [the implementation plan](router-effect-implementation-plan.md) for progress and verification evidence.

## Problem

The v0.14.1 specification already describes a React 19 + Vite + TanStack Router + TanStack Query frontend for the fullstack shape (section 4.2). The current generator instead composes its fullstack frontend from the TanStack Start app layer. Users cannot explicitly generate a Router-only SPA.

Section 30 names Rubik's simplicity and Better T Stack's selectable technologies as inspirations. The user confirmed https://rubik.sachi.dev/ as the intended reference; its corresponding repository is sachigoyal/rubik.

## Reference findings

### Rubik

Sources: https://rubik.sachi.dev/ and https://github.com/sachigoyal/rubik

Its documented stack is React 19, Vite, TanStack Router, TanStack Query, Tailwind v4, Base UI, Hono on Cloudflare Workers, tRPC, Neon, Drizzle, and Better Auth. Its web application is a SPA with a React createRoot entrypoint and the TanStack Router Vite plugin. The repository uses pnpm and Turborepo, and documents a separate browser API origin and static frontend hosting.

Relevant source files:

- https://github.com/sachigoyal/rubik/blob/main/apps/web/package.json
- https://github.com/sachigoyal/rubik/blob/main/apps/web/vite.config.ts
- https://github.com/sachigoyal/rubik/blob/main/apps/web/src/main.tsx

Borrow the small, explicit application shape, browser-only React entrypoint, Router/Query integration, and a removable end-to-end example. Flare retains its existing Bun, Oxc, shared UI, structured logs, and same-origin Service Binding conventions. Following the user's revised direction, the proposed frontend uses ordinary HTTP calls rather than Hono RPC or tRPC, while backend workflows use Effect. OAuth providers, transactional email, and a second browser API origin are separate decisions and are outside this change.

### Better T Stack

Source: https://github.com/AmanVarshney01/create-better-t-stack

Its current README lists React with TanStack Router separately from TanStack Start. This supports exposing the frontend distinction explicitly. Flare will keep a narrow compatibility table rather than accept arbitrary library combinations.

Builder reference: https://better-t-stack.dev/new. The current page exposes compatibility-aware choices and a generated scaffolding command. Flare adopts that choose/review/copy interaction for its own bounded presets, without exposing unsupported frameworks, providers, or package managers.

### Official integration references

- https://tanstack.com/router/latest/docs/framework/react/installation/with-vite — the Router plugin precedes the React plugin and supports file-based routes and automatic code splitting.
- https://developers.cloudflare.com/workers/vite-plugin/tutorial/ — a React SPA can use Workers static assets and a Worker entrypoint with the Cloudflare Vite plugin. Build output includes a generated Wrangler configuration; development and deployment routing must agree.

References were read from public source and documentation, including the user-confirmed Rubik homepage. No upstream code was executed and Rubik's authenticated application flows were not tested.

## Alternatives

1. **Recommended: additive frontend choice for fullstack.** Add `--frontend router`, retain `start` as the existing default, and reuse fullstack lifecycle orchestration. This preserves frontend defaults and deployment topology and adds five explicit combinations. Per the user's revised backend direction, all newly generated fullstack projects use Effect/HTTP instead of Hono RPC.
2. Replace the existing fullstack frontend with a SPA. This is closer to the original section 4.2 but silently changes the result of existing generator commands and removes the existing Start frontend choice.
3. Introduce a fifth preset named `spa`. This is easy to describe, but mixes rendering choice with deployment topology and risks duplicating fullstack lifecycle handling.

## Proposed interface and compatibility

```powershell
bun packages/create-flare-stack/bin/create-flare-stack.ts my-app --preset fullstack --frontend router --db d1 --auth
```

The example is a proposed command, not an implemented command.

Normalize omitted frontend to `start` for existing app/fullstack generation. Accept `router` only for fullstack. Reject explicit frontend choices on worker and extension, and reject app + router with an explanation that server functionality belongs in the fullstack backend. Preserve existing config loading when the frontend field is absent.

| New frontend/topology          | Database | Authentication |
| ------------------------------ | -------- | -------------- |
| React + Router SPA / fullstack | none     | none           |
| React + Router SPA / fullstack | D1       | none           |
| React + Router SPA / fullstack | D1       | Better Auth    |
| React + Router SPA / fullstack | Neon     | none           |
| React + Router SPA / fullstack | Neon     | Better Auth    |

The supported source matrix becomes 19 combinations. This count is not a claim of remote acceptance. The existing app + D1 + Better Auth path remains the primary v1 hardening path.

## Runtime and generated files

The public web Worker serves Vite assets, including SPA deep-link fallback, and forwards `/api/*` requests to the private server Worker through the existing Service Binding. The server owns database bindings, secrets, Better Auth, and application mutations. Browser requests remain relative to the web origin; no database runtime enters the client bundle.

The SPA frontend contains `index.html`, a `createRoot` entrypoint, Router file-based routes, a stable QueryClient provider, an HTTP client, shared UI styles, and a small data example when a database is selected. It has no Start server functions, Start server-route files, document hydration entrypoint, or `@tanstack/react-start` dependency.

### TanStack Query and Effect boundaries

The browser data flow is Router route/component → TanStack Query → same-origin HTTP request → backend HTTP adapter → Effect service → Drizzle/database. Effect provides business workflows, typed domain errors, injected services/layers, and scoped resource handling. Request-specific bindings and resources must not escape their Cloudflare request lifetime.

Query functions own reads, cancellation signals, and response decoding. Mutation functions own writes, check non-success HTTP responses, and invalidate only the affected query keys after success. Transport failures, expected domain failures, and unauthenticated responses must become actionable frontend error states. The client must not retry non-idempotent mutations automatically or hide HTTP errors behind successful JSON parsing.

Define Zod request/response schemas and inferred DTO types in `packages/shared/src/api.ts`, exported as `@repo/shared/api`. This package depends directly on Zod and exports no server code. The initial contract covers health and item read/create operations using the existing backend route semantics. Each operation exports its method/path, request schema where applicable, and response schema. Errors use `{ error: { code, message }, requestId }`, with validation mapped to 400, unauthenticated requests to 401, forbidden access to 403, missing resources to 404, conflicts to 409, and unexpected defects to 500 with a generic public message. Native Better Auth endpoints retain their upstream response format and cookie behavior.

Runtime validation replaces Hono RPC's inferred client contract; the browser must not import server application types, Effect runtime services, Cloudflare bindings, database clients, or secrets. Validate untrusted input on the backend and decoded HTTP responses on the frontend. Do not claim an ordinary fetch wrapper preserves RPC inference automatically.

For both fullstack frontend variants, application data queries run in the browser and call relative `/api/*` URLs. The Start variant may render its page shell on the server, but this first implementation does not prefetch application queries during SSR. Do not add parallel Start server-function data adapters or a second application data cache. The QueryClient is constructed once per mounted browser application; no process-global server QueryClient stores user data. This intentionally trades SSR data prefetch for one transport path and a smaller initial implementation.

Existing project guidance describes a `runEffect` bridge to Hono, but the current fullstack template does not install Effect. The implementation must supply the actual bridge and services rather than treating the skill text as proof of existing functionality. Thin Hono handlers parse HTTP input and run the Effect boundary; business logic remains in Effect services. Do not add a Node HTTP listener inside Workers.

Each Hono request creates/provides its bindings, request ID, auth/session context when needed, and database adapter through a single `runEffect` boundary executing an `Effect.scoped` program. Only immutable schema definitions and service tags/layer factories may be module-global. Do not retain request bindings, sessions, clients, or a request-provided runtime globally. D1 uses that request's binding and requires no connection close; Neon acquires a request-scoped pool and releases it after the Effect settles on success or failure. Defects are logged through evlog with request ID correlation; logs and public responses must not include secrets or raw database errors.

All newly generated fullstack backends use Effect services behind thin Hono HTTP routes. Both the existing Start frontend and the new Router SPA consume that HTTP contract with TanStack Query; remove generated Hono RPC clients and server AppType imports from both frontend variants. Keep server function adapters only where the Start frontend requires them, and do not maintain two independent data caches for the same reads. Existing already-generated projects retain their behavior until an explicit migration is designed. The single-app Start preset retains its server-function architecture and is outside this backend replacement.

Implement a dedicated Router overlay after the selected fullstack database/auth layers, with explicit removal of inherited Start-only files. Validate the final output rather than treating the overlay as a standalone package.

Direct dependency pins for the implementation: keep React 19.2.8, Vite 7.3.6, Cloudflare Vite plugin 1.62.2, Router 1.170.40, and Start 1.168.59 for the Start variant. Add Router plugin 1.168.41 (already present in the repository lockfile with Router ^1.170.40 peer compatibility), Query 5.104.3, Effect 3.22.2 on the backend, and Zod 4.6.5 in the shared contract. Query and Effect versions were checked against the registry on 2026-10-15. Effect intentionally uses the v3 line matching the reviewed service/layer conventions; adopting Effect 4 is outside this design. Do not copy Rubik's ranges or upgrade unrelated packages. Actual generated install/build checks remain the compatibility gate.

For the Router SPA, use Vite plugin order `tanstackRouter`, Tailwind, React, Cloudflare, then the existing security-header plugin. Configure the Cloudflare environment as `worker` rather than Start's `ssr`; its source entry is `apps/web/src/worker.ts`, which forwards `/api/*` to `SERVER` and falls back to the asset binding with Flare response policies. Use `index.html` and `src/main.tsx` as the browser entry. Commit a generated route tree with each Router template so the initial `bun check` works before the first build; let the Router Vite plugin refresh it on dev/build, and assert it stays current in the generated fixture. `bun run build` must emit the Worker and its generated Wrangler config; use its generated redirect rather than a guessed output path.

The web Worker entrypoint and Vite configuration must preserve Flare's security headers, request IDs, preview noindex behavior, canonical local persistence path, and API-first routing. Verify direct navigation and refresh on nested SPA routes, including requests that do not send browser navigation headers. An unmatched `/api/*` request must remain an API error rather than return `index.html`.

## CSS-variable theming

Retain Base UI primitives and the shared `@repo/ui` package. All generated frontend variants use Tailwind v4 mapped to semantic CSS custom properties in `packages/ui/src/styles/globals.css`. User requirement: changing the shared theme variables must update component styling without editing component files.

Keep semantic color pairs such as background/foreground, primary/primary-foreground, surface/foreground, border, input, and ring. Provide shared typography, radius, and shadow tokens as well. Define default values in `:root` and dark-theme overrides in `.dark`, with reusable named theme overrides allowed on a root container. Consume these through Tailwind theme mappings, including inline mappings where necessary for scoped variable overrides. Components use semantic utilities and shared variants rather than hard-coded brand colors, raw color literals, or per-component theme copies.

Keep `cssVariables: true` in shadcn configuration. Document where to override tokens and how to apply light/dark or named themes. Acceptance includes checking that overriding primary color, font, radius, and shadow variables changes representative shared components in both Start and Router output, including scoped themes and interactive states. Verify that Base UI portal content receives the intended theme scope. Default styling should stay visually consistent; adding a theme editor or restyling the reference app is outside this request.

## Verified UI issues and required corrections

The 2026-10-15 audit compared source and templates with current official shadcn/Base UI guidance. `bun check` passed, but shadcn 4.21.5 rejected the project configuration. Its `rawConfigSchema` identified the missing `aliases.utils` entry in both live configs. A Tailwind 4.3.3 compilation check also confirmed the difference between indirect `@theme` utilities and direct semantic-variable references generated by `@theme inline`. These are code/tool findings; the audit did not establish complete browser or accessibility acceptance.

| Priority | Verified issue                                                                                                                             | Required correction                                                                                                                                                                                                                                                                                     | Completion evidence                                                                                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | `apps/web/components.json` and `packages/ui/components.json` omit required `aliases.utils`; both generator configs have the same omission. | Add `@repo/ui/lib/utils` in the app and the matching local/shared utility alias in the UI package; update generator copies. Reconcile the advertised hooks alias with UI package exports before scaffolding hooks.                                                                                      | Both configs pass the current shadcn schema and `shadcn info`; a disposable generated project resolves a registry component's utility imports into the shared package.                         |
| P1       | Source and template theme mappings use `@theme`, which can resolve inherited aliases outside a nested theme override.                      | Use `@theme inline` for mappings to semantic custom properties. Keep CSS-variable mode enabled; supply typography/shadow tokens as specified above.                                                                                                                                                     | Compiled utilities reference semantic variables directly; global light/dark and nested primary/font/radius/shadow overrides work, including portal content.                                    |
| P1       | `packages/ui/src/components/tooltip.tsx` and its template use custom mouse/focus state, with no Escape dismissal or primitive positioning. | Replace the implementation with Base UI Tooltip provider/root/trigger/portal/positioner/popup composition; preserve the existing simple wrapper API through an adapter or update all consumers deliberately. Give icon-only triggers accessible names and keep essential instructions outside tooltips. | Keyboard focus and hover reveal the tooltip; Escape dismisses it; hover/focus persistence and viewport positioning work. Verify against the selected Base UI version's accessibility guidance. |
| P2       | Dropdown root/content/item wrappers expose only a small subset of Base UI props.                                                           | Derive props from the actual primitive components and forward supported props/ref. Keep current placement defaults while allowing overrides; expose controlled state and disabled item behavior. Apply the same prop-forwarding review to dialog wrappers.                                              | Consumers can supply controlled open state, disabled items, ARIA attributes, refs, and alternative placement; keyboard and focus-return behavior remain correct.                               |
| P2       | The base template's `animate-in` utility references `enter`, but the template contains no `@keyframes enter`; the live UI package does.    | Synchronize the missing keyframes and intentional animation tokens into the template or adopt the selected official animation CSS consistently. Preserve reduced-motion handling.                                                                                                                       | Generated output contains the referenced keyframes, and real generated dialog/menu/tooltip entrance behavior is verified.                                                                      |

Modernization work must remain separate from actual failures: the deprecated `style: default`, absent `data-slot` attributes, older Base UI package name/version, and retained `forwardRef` patterns do not by themselves prove a runtime defect. Select a current Base UI-compatible shadcn style, such as `base-nova`, consistently for new generated projects; verify the pinned CLI's actual registry support before changing either config. Add semantic `data-slot` attributes for component anatomy and use the corresponding primitive prop types. Do not blindly overwrite customized UI or change colors, spacing, and component behavior as an incidental migration. HSL color values remain valid; changing color space is optional.

Official references:

- https://ui.shadcn.com/docs/monorepo
- https://ui.shadcn.com/docs/components-json
- https://ui.shadcn.com/docs/tailwind-v4
- https://ui.shadcn.com/docs/theming
- https://ui.shadcn.com/docs/components/base/tooltip
- https://base-ui.com/react/components/tooltip

React Doctor's audit run was incomplete because its lint subprocess failed on a Windows/Bun path. Do not record a passing score. Re-run a working verifier during implementation and report any tool limitation separately from actual component findings.

## Simple landing page and preset command builder

### Job and intended experience

The primary user is Jojo starting a new project and wanting to choose a tested stack, copy one command, and start building. A successful visit ends with a valid, version-correct scaffolding command rather than another round of infrastructure choices. Use Rubik's concise introduction and Better-T-Stack's interactive selection/command pattern as references. Keep the site small, fast, and usable without sign-in.

Proposed home page at `/`:

1. A small header with Flare Stack, a link to the preset section, and the repository/docs link.
2. A short hero explaining the personal Cloudflare-first startup pack, one primary **Choose a template** link to `#presets`, and a compact default quick-start command.
3. A brief stack summary using accurate technology names. It must distinguish the single-app Start architecture from the dedicated Effect backend used by fullstack templates.
4. The **Presets** section at `#presets`, containing the builder, complete compatibility matrix, and copyable command.
5. Three short next steps: run the command, follow the generated setup instructions, then start local development. Deployment remains an explicit later operation.

Keep this as one landing page with an integrated builder section for the first version. Do not introduce a separate wizard, authentication, pricing page, CMS, testimonials, animated background, or unsupported reliability claims. A separate `/new` route can be added later if the builder becomes large enough to need one.

Proposed implementation home: a dedicated `apps/site` workspace using React, Vite, TanStack Router, Tailwind v4, and `@repo/ui`, hosted on Cloudflare Workers with static assets. It has no database or authentication requirement. This lets the public quick-start site use the new SPA path while leaving the existing reference/demo application intact. Read its own AGENTS instructions before implementation; create focused instructions if the workspace is new. This workspace/location is a proposal, not an already-existing deployable app.

### Builder controls and compatibility

Use an inline form with a visible stack summary and command preview. Controls are project name, project shape (`app`, `fullstack`, `worker`, `extension`), frontend for fullstack (`start` or `router`), database (`none`, `d1`, `neon`), and authentication (`none` or Better Auth). Bun and Cloudflare are fixed conventions where applicable, not extra selectors. Show WXT, React, Tailwind, and browser packaging for extension instead of implying that an extension deploys to Workers.

Default to `app` + D1 + Better Auth, with project name `my-app`. Fullstack backend is Effect services with thin Hono HTTP routes; server-state reads/mutations use Query with the selected frontend. Worker remains the existing standalone backend preset unless a separate Effect migration is approved. Database-backed presets use Drizzle. Frontend-enabled shapes share Base UI, Tailwind v4, and CSS-variable themes.

Apply compatibility rules from the same browser-safe catalog used by the CLI. Database `none` disables Better Auth with an inline reason. Worker disables frontend/session-auth choices. Extension disables database/backend/auth choices. Router is available only for fullstack. If a parent choice invalidates a selected child, normalize it deterministically and announce what changed; never leave a hidden incompatible selection in the command.

Show an expandable/filterable list or compact table of every valid combination so the user can browse all templates, not only discover them by changing selectors. Selecting a row updates the controls and command. Avoid 19 large, repetitive cards. Every displayed full stack must enumerate runtime/hosting, framework/frontend, backend where present, auth, database/ORM, and tooling; use readable labels rather than unexplained preset identifiers alone.

### Complete planned matrix

| #   | Shape     | Frontend                               | Backend                       | Database       | Authentication |
| --- | --------- | -------------------------------------- | ----------------------------- | -------------- | -------------- |
| 1   | app       | React + TanStack Start                 | Start server functions/routes | none           | none           |
| 2   | app       | React + TanStack Start                 | Start server functions/routes | D1 + Drizzle   | none           |
| 3   | app       | React + TanStack Start                 | Start server functions/routes | D1 + Drizzle   | Better Auth    |
| 4   | app       | React + TanStack Start                 | Start server functions/routes | Neon + Drizzle | none           |
| 5   | app       | React + TanStack Start                 | Start server functions/routes | Neon + Drizzle | Better Auth    |
| 6   | fullstack | React + TanStack Start + Query         | Hono HTTP + Effect            | none           | none           |
| 7   | fullstack | React + TanStack Start + Query         | Hono HTTP + Effect            | D1 + Drizzle   | none           |
| 8   | fullstack | React + TanStack Start + Query         | Hono HTTP + Effect            | D1 + Drizzle   | Better Auth    |
| 9   | fullstack | React + TanStack Start + Query         | Hono HTTP + Effect            | Neon + Drizzle | none           |
| 10  | fullstack | React + TanStack Start + Query         | Hono HTTP + Effect            | Neon + Drizzle | Better Auth    |
| 11  | fullstack | React + Vite + TanStack Router + Query | Hono HTTP + Effect            | none           | none           |
| 12  | fullstack | React + Vite + TanStack Router + Query | Hono HTTP + Effect            | D1 + Drizzle   | none           |
| 13  | fullstack | React + Vite + TanStack Router + Query | Hono HTTP + Effect            | D1 + Drizzle   | Better Auth    |
| 14  | fullstack | React + Vite + TanStack Router + Query | Hono HTTP + Effect            | Neon + Drizzle | none           |
| 15  | fullstack | React + Vite + TanStack Router + Query | Hono HTTP + Effect            | Neon + Drizzle | Better Auth    |
| 16  | worker    | none                                   | Standalone Hono Worker        | none           | none           |
| 17  | worker    | none                                   | Standalone Hono Worker        | D1 + Drizzle   | none           |
| 18  | worker    | none                                   | Standalone Hono Worker        | Neon + Drizzle | none           |
| 19  | extension | WXT + React + Tailwind                 | none                          | none           | none           |

This is the target source matrix after implementation, not a list of 19 currently published/accepted artifacts. The site must identify whether a selection is released, locally verified, experimental, or planned, and show the exact release version. In particular, the Effect backend replacement changes newly generated fullstack output even where the option combination existed before; the older archive must not be described as generating that new backend.

### One catalog and truthful commands

Extract the compatibility catalog, normalized selection validation, and command serialization into browser-safe generator modules, for example `packages/create-flare-stack/src/catalog.ts` and `command.ts`, exported through explicit package subpaths. The site depends only on these pure entrypoints; never import the Node/filesystem-based materializer or release-preparation code into its bundle. The CLI planner and fixtures consume the same catalog. Keep these modules inside the packed generator's existing `src/**` distribution so generated commands do not depend on unpublished workspace-only packages.

Each released manifest records the generator archive URL, matching Flare CLI version, supported options, and accepted combinations. The site targets an explicit matching manifest. A stable command uses Flare's actual GitHub archive distribution:

```powershell
bunx --bun --package https://github.com/jojomensah89/flare-stack/releases/download/v0.14.1/create-flare-stack-0.14.1.tgz create-flare-stack my-app --preset app --db d1 --auth
```

This illustrates the existing distribution shape; verify the artifact and selected combination before enabling it in the site. Do not use `bun create flare-stack` unless that registry entrypoint is actually shipped and verified. Do not send `--frontend router` or describe Effect output against the v0.14.1 archive. Until a matching new release exists, show new selections as planned/unreleased and disable the production command's Copy action with a short reason. Released legacy fullstack choices must describe their actual Hono RPC backend, or remain unavailable in the new-backend catalog, rather than advertise Effect incorrectly.

Do not offer a local-checkout mode. Every copyable command must target a verified published release and an accepted combination in its manifest. Keep other catalog choices visible as not yet published, with no command to copy, until a compatible release includes them. Never embed machine-specific paths or local Flare archive paths in a public command.

Build commands from a validated argument array, not arbitrary shell string concatenation. Reuse the generator's project-name validation, including invalid/reserved Windows names and destination rules; restrict this UI to a project-name destination. Fixed options are serialized from catalog values, not user-supplied shell fragments. Verify displayed output and copied output are identical for PowerShell, which is the primary target; the initial allowed project-name grammar should also make the command portable to common Unix shells. A copy action copies text only and never executes code or starts a download.

### States, accessibility, and theming

Update the command immediately after valid selections. Show the full command in a readable, horizontally scrollable code block, with **Copy command**, brief **Copied** feedback, and an announced error if clipboard access fails. Keep selectable text for manual copying. Inline validation explains invalid names and disables copying until fixed. A failed/missing release manifest must show an actionable unavailable state rather than a fallback that invents a command.

Use semantic form labels, keyboard-accessible controls, visible focus, an accessible table/list, and polite live announcements for copy feedback and normalized selections. On mobile, stack controls above the command; on wider screens, keep the command and current stack summary visible beside the controls without hiding them behind a wizard. Support long project names, long commands, zoom, reduced motion, light/dark themes, and Base UI popups. There is no account or secrets input and no telemetry requirement for the first version.

The landing page should stay visually simple and use the shared theme variables. A Rubik reference does not authorize a pixel-for-pixel clone or replacing Flare's existing design tokens. Choose final page composition during the separate UI design phase; this proposal fixes content, hierarchy, behavior, and acceptance, not a finished visual mockup.

### Website completion evidence

- The page lists exactly the valid combinations from the shared catalog, with no duplicates or incompatible auth/database/frontend states.
- Selecting a combination and a valid project name produces a deterministic command; parsing that command's arguments through the matching CLI resolves the same normalized project plan.
- A displayed backend summary matches the selected artifact, including legacy release behavior. Planned/unreleased choices cannot copy an apparently usable published command.
- Verify copy success, permission/failure feedback, manual selection, name errors, keyboard operation, mobile layout, light/dark themes, scoped theme overrides, and popup behavior in a real browser.
- The latest shadcn schema and CLI accept both source and generated configurations after the UI fixes. Representative registry additions resolve to the shared UI package in a disposable fixture.
- A copied released golden-path command and the Router + D1 + auth command from its matching candidate archive each scaffold a disposable project through install/setup/check/build. Generation evidence does not by itself prove a new Cloudflare deployment.
- Build the site, verify its Worker/static-assets output and direct navigation, and report the local/browser evidence. Publishing site or package releases is a separate user approval.

## Lifecycle and configuration

Keep the existing fullstack server-first deployment, isolated persistent preview Workers, coordinated release tags, and paired rollback. Record frontend selection in generated Flare configuration with a backward-compatible default. Audit setup, doctor, build-output discovery, bindings generation, and all generated scripts for Start-specific assumptions. Use the actual generated Wrangler build redirect for the SPA Worker; never assume the Start SSR output path.

Make resource ownership explicit in the loaded project context: both web and server roles need their own Wrangler path/config, required secret names, and generated binding types. For fullstack, D1 provisioning/migrations and auth/Neon secrets must target the server Worker, while public hosts and the Service Binding belong to the web role. Local setup initializes the server's `.dev.vars` and types as well as the web role. Update database commands, secret bootstrap/push, environment validation, and doctor to consume these role-specific targets. Current web-first implementations are not sufficient merely because two Worker configs exist. Fixtures must assert concrete server D1 IDs and server secret destinations rather than only checking deployment order.

Generated README and AGENTS instructions must describe the selected frontend, both deployable apps, supported local commands, backend ownership, and the same-origin API contract. Root documentation must distinguish source support, current local verification, and remote acceptance.

Primary file sets: generator `model.ts`, `args.ts`, `cli.ts`, `plan.ts`, `materialize.ts`; new Router overlays and the existing fullstack backend/frontend overlays; lifecycle `config.ts`, `project.ts`, `setup.ts` and setup/db/secrets/env/doctor command handlers; planner/packed/generated-project/lifecycle fixtures; generated README/AGENTS; root and generator READMEs. Update the normative specification and its JSON companion for the intentional fullstack Effect/HTTP change while recording the version boundary from the published v0.14.1 artifact.

Additional file sets for the expanded scope: shared UI component/config/theme files and corresponding generator copies; pure generator catalog/command modules and their package exports; a new dedicated `apps/site` workspace with its own instructions and Cloudflare config; website command/compatibility fixtures and browser acceptance evidence.

## Validation and completion evidence

1. Planner and argument fixtures cover all five Router combinations, invalid frontend/preset combinations, and unchanged option defaults/topology for the existing 14 combinations. Update the five existing fullstack outputs and fixtures for the intentional Effect/HTTP backend replacement.
2. Packed generator fixtures include the new overlay and assert no Start imports/dependencies survive in Router output.
3. Disposable generated projects exercise real Bun install, setup, check, and production build for all five new combinations using a local Flare archive. Neon fixtures use a disposable localhost URL and do not claim live Neon acceptance.
4. Runtime fixtures verify SPA root/deep links, schema-validated HTTP requests/responses, Effect success/domain-error/defect handling, Query mutation invalidation, response policies, Service Binding forwarding, and auth cookie forwarding. At least one actual generated D1 + auth application proves local migration, data read/write, signup, session, and signout through the public web origin.
5. Existing lifecycle fixtures verify server-first deploy, preview isolation, and paired rollback with Router build/config output.
6. Run `bun run format` after changing templates, then `bun check`, `bun run build`, relevant CLI/generator verification, and `git diff --check`.
7. Report local results separately from Cloudflare acceptance. A remote deployment and remote mutations require an explicitly selected disposable target and user release approval.

8. Complete the UI correction evidence and website acceptance checks above. A passing lint/type gate does not substitute for shadcn configuration validity, tooltip interaction, clipboard behavior, scoped theme inheritance, or generated animation checks.

## Delivery order

1. Repair shared UI/config/theme issues and synchronize the generator copies; establish source and generated fixture checks.
2. Implement the Effect/HTTP backend contract and role-aware resource lifecycle for fullstack; update existing Start/fullstack fixtures.
3. Implement the Router SPA option, shared catalog, and command serialization; verify the five new combinations and the existing matrix.
4. Design and build the simple landing page with its integrated preset builder against the verified catalog. Local preview may precede publication; production Copy is enabled only for an actual compatible release.
5. Present generated-project and browser evidence, then obtain user approval for the concrete package/site release. Do not publish merely to make a proposed website command appear valid.

## Scope boundaries

This proposal covers the Router SPA architecture, Effect services behind thin Hono HTTP routes, TanStack Query integration, verified shared UI corrections and CSS-variable theming, and a simple landing page with an integrated preset command builder. It adds no runtime provider or database profile. Preserve the current reference/demo application; place the proposed website in its own workspace. Automatic existing-project migration, package publication, and remote deployment remain outside implementation authorization and require explicit release approval. The builder's first version only selects presets and copies commands; it does not scaffold files in the browser, provision resources, or implement the full M13 lifecycle-management dashboard from the wider roadmap.

Existing unrelated changes to AGENTS.md and the untracked v1 roadmap must be preserved.

Compatibility note: existing generator commands retain their selected frontend and topology, but newly generated fullstack projects intentionally move from Hono RPC to the user-requested Effect/HTTP contract. Update the five existing fullstack fixtures as well as adding the five Router fixtures; app, worker, and extension templates are not part of this backend replacement. Preserve older lifecycle config loading and do not imply this source change has been published in the existing v0.14.1 release archive.
