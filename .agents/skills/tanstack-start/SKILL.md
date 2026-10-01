---
name: tanstack-start
description: Procedures and conventions for TanStack Start routing and server functions.
---

# TanStack Start Skill

## Structure

- `src/router.tsx`: Defines `createRouter` and exports `getRouter()`.
- `src/routes/__root.tsx`: Top-level document shell with `<HeadContent />`, `<Outlet />`, `<Scripts />`.
- `src/routes/`: File-based route hierarchy.
- `createServerFn`: For type-safe RPC server functions.
- `createFileRoute`: For UI routes and API endpoints via the `server` handler property.
