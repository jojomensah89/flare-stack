---
name: flare-web
description: Guidance for building web surfaces in Flare Stack projects.
---

# Flare Web Skill

## Key Rules

1. **Design System**: Use `@repo/ui` and shadcn components.
2. **Tailwind v4**: Do not create a `tailwind.config.js`. CSS variables and tokens are defined in `@repo/ui/src/styles/globals.css`.
3. **No Arbitrary Classes**: Avoid arbitrary values (e.g. `w-[237px]`) or raw colors (e.g. `#123456`). Use design system tokens.
4. **Layout Restyling**: `shadcn/no-restyle` is enforced; consumer apps may apply layout utilities (`flex`, `grid`, `m-*`, `w-*`), but must not recolor or rewrite component internals.
