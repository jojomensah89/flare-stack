# React + TanStack Router SPA: reference review and proposed design

Status: proposed; awaiting design approval before implementation.
Reviewed: 2026-10-15.

User-confirmed direction: React + TanStack Router, TanStack Query, no Hono RPC, and Effect backend services with thin Hono HTTP routes. The prior Hono RPC recommendation is superseded.

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

## Lifecycle and configuration

Keep the existing fullstack server-first deployment, isolated persistent preview Workers, coordinated release tags, and paired rollback. Record frontend selection in generated Flare configuration with a backward-compatible default. Audit setup, doctor, build-output discovery, bindings generation, and all generated scripts for Start-specific assumptions. Use the actual generated Wrangler build redirect for the SPA Worker; never assume the Start SSR output path.

Make resource ownership explicit in the loaded project context: both web and server roles need their own Wrangler path/config, required secret names, and generated binding types. For fullstack, D1 provisioning/migrations and auth/Neon secrets must target the server Worker, while public hosts and the Service Binding belong to the web role. Local setup initializes the server's `.dev.vars` and types as well as the web role. Update database commands, secret bootstrap/push, environment validation, and doctor to consume these role-specific targets. Current web-first implementations are not sufficient merely because two Worker configs exist. Fixtures must assert concrete server D1 IDs and server secret destinations rather than only checking deployment order.

Generated README and AGENTS instructions must describe the selected frontend, both deployable apps, supported local commands, backend ownership, and the same-origin API contract. Root documentation must distinguish source support, current local verification, and remote acceptance.

Primary file sets: generator `model.ts`, `args.ts`, `cli.ts`, `plan.ts`, `materialize.ts`; new Router overlays and the existing fullstack backend/frontend overlays; lifecycle `config.ts`, `project.ts`, `setup.ts` and setup/db/secrets/env/doctor command handlers; planner/packed/generated-project/lifecycle fixtures; generated README/AGENTS; root and generator READMEs. Update the normative specification and its JSON companion for the intentional fullstack Effect/HTTP change while recording the version boundary from the published v0.14.1 artifact.

## Validation and completion evidence

1. Planner and argument fixtures cover all five Router combinations, invalid frontend/preset combinations, and unchanged option defaults/topology for the existing 14 combinations. Update the five existing fullstack outputs and fixtures for the intentional Effect/HTTP backend replacement.
2. Packed generator fixtures include the new overlay and assert no Start imports/dependencies survive in Router output.
3. Disposable generated projects exercise real Bun install, setup, check, and production build for all five new combinations using a local Flare archive. Neon fixtures use a disposable localhost URL and do not claim live Neon acceptance.
4. Runtime fixtures verify SPA root/deep links, schema-validated HTTP requests/responses, Effect success/domain-error/defect handling, Query mutation invalidation, response policies, Service Binding forwarding, and auth cookie forwarding. At least one actual generated D1 + auth application proves local migration, data read/write, signup, session, and signout through the public web origin.
5. Existing lifecycle fixtures verify server-first deploy, preview isolation, and paired rollback with Router build/config output.
6. Run `bun run format` after changing templates, then `bun check`, `bun run build`, relevant CLI/generator verification, and `git diff --check`.
7. Report local results separately from Cloudflare acceptance. A remote deployment and remote mutations require an explicitly selected disposable target and user release approval.

## Scope boundaries

This change restores the documented React/Vite SPA architecture on Workers with Drizzle and Better Auth, and adds the user-requested Effect services and TanStack Query integration behind thin Hono HTTP routes. It adds no runtime provider or database profile. It does not change the reference application's UI, migrate existing projects automatically, publish release archives, deploy remotely, or implement the visual Builder.

Existing unrelated changes to AGENTS.md and the untracked v1 roadmap must be preserved.

Compatibility note: existing generator commands retain their selected frontend and topology, but newly generated fullstack projects intentionally move from Hono RPC to the user-requested Effect/HTTP contract. Update the five existing fullstack fixtures as well as adding the five Router fixtures; app, worker, and extension templates are not part of this backend replacement. Preserve older lifecycle config loading and do not imply this source change has been published in the existing v0.14.1 release archive.
