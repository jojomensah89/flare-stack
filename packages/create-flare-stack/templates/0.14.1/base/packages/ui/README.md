# Shared UI

Base UI primitives use the `base-nova` shadcn registry, Tailwind v4, `tw-animate-css`, and `shadcn/tailwind.css`. Run shadcn from `packages/ui` to add primitives; web components route to this package through `components.json` aliases.

Theme by overriding the semantic CSS custom properties in `src/styles/globals.css`. Colors, charts, sidebar colors, radius, fonts, and shadows map through `@theme inline`, so scoped overrides resolve where each utility is used. Set `.dark` on `html` for a global dark theme. Motion respects `prefers-reduced-motion`.

Dialogs, dropdowns, and tooltips portal to `body` by default. For a section-scoped theme, pass `portalProps={{ container: themedElement }}` to `DialogContent`, `DropdownMenuContent`, or the compatibility `Tooltip` wrapper so portal content inherits the same variables. The tooltip primitive exports also support explicit composition.

Keep the shared package and the generator's base UI template in sync. Verify both rendered output and shadcn configuration before shipping a generator change.
