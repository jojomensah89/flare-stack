---
name: shadcn-lint
description: Guidance on @shadcn/lint rules, violations, and design system enforcement.
---

# shadcn-lint Skill

## Rules Enforced

- `shadcn/no-raw-colors`: Disallows hardcoded colors like `#fff` or `rgb()`. Use theme colors (`bg-primary`, `text-muted-foreground`, etc.).
- `shadcn/no-arbitrary-values`: Disallows arbitrary brackets like `p-[13px]`. Use design-token scale.
- `shadcn/no-inline-styles`: Prohibits inline `style={{ ... }}`.
- `shadcn/no-unknown-classes`: Prohibits unknown or misspelled Tailwind classes.
- `shadcn/require-static-classes`: Prohibits dynamic class concatenation that escapes static analysis.
- `shadcn/no-restyle`: Prohibits restyling base component variants directly in consuming apps, allowing only layout classes.

## Enforcement

Never suppress design-system lint errors with `oxlint-disable` or `eslint-disable` comments. Fix the code to adhere to the design system.
