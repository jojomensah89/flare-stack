---
name: shadcn
description: shadcn/ui conventions, component creation, and monorepo component routing.
---

# shadcn/ui Skill

## Conventions

1. **Shared Workspace**: Components reside in `packages/ui/src/components/`.
2. **Components Configuration**: Monorepo routing is handled by `components.json` in both `apps/web` and `packages/ui`.
3. **Adding Components**: Add components to `packages/ui` and re-export them from `@repo/ui`.
4. **Primitives**: Use Base UI primitives where available.
