# Flare Stack Site

This workspace is the standalone landing page and preset command builder.

- Use Bun and the shared `@repo/ui` package.
- The preset matrix, compatibility normalization, project-name validation, and commands come only from `create-flare-stack/catalog`.
- Do not import generator filesystem/materialization code into this browser bundle.
- Keep release and local-checkout commands clearly distinguished. Never describe planned output as a released command.
- This is a Cloudflare Workers static-assets site. Keep it free of server bindings and secrets.
- Use semantic theme utilities; no raw colors, arbitrary Tailwind values, or inline styles.
- The landing page follows the user's warm parchment reference: light canvas, warm ink, regular-weight headings, compact 4px corners, and sparse orange text links. Theme values live in `src/site.css`; register site utilities with `@utility` so shadcn lint can verify them.
- Use native HTML `select` elements for preset choices. Do not replace them with a custom select primitive.
- Preserve the original ASCII flame and the live command builder. Read `emil-design-eng` and `design-taste-frontend` for craft work, applying the user's reference over conflicting generic skill rules.
