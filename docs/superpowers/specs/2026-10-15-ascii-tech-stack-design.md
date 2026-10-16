# Animated ASCII tech stack

Approved in the conversation: permanent technology cards, subtle continuous ASCII shimmer with stronger hover/focus response, fixed responsive grid, and reduced motion. The 16 October revision requests actual brand logos and colors, plus WXT and Neon. Cards: TanStack (Start/Router/Query), Cloudflare Workers, Effect, D1 + Drizzle, Better Auth, Base UI + Tailwind v4, WXT, and Neon.

Place the section between the hero and the existing builder. The cards sit on a dark showcase with a quiet ASCII character field and a real local SVG mark for each brand. Brand colors use CSS variables; the supplied TanStack hover screenshot guides the color emphasis, and the rest of the landing page keeps its parchment background. The actual logo paths come from Simple Icons or the vendors' published assets; do not redraw, distort, or crop them. Paired technologies display both marks. Card text uses proper brand casing and sentence-case category and detail labels. Links lead to official documentation and provide keyboard focus feedback. Card positions never animate.

Use the existing CSS-variable palette and type. Four columns on desktop, two on tablet, and one on narrow phones. No carousel, sticky section, scroll-linked animation, or smooth anchor scrolling. Include a pause/resume control and honor reduced motion by showing static art. Avoid per-frame React updates, new dependencies, remote image requests, and canvas. In the preset matrix, render database labels as None, D1, and Neon; do not uppercase `neon`.

Implementation: isolate the artwork/data/rendering in tech-stack.tsx and its styles in tech-stack.css; import the section into site.tsx and remove global smooth scrolling in site.css. Preserve the builder and unrelated local work.

Validation: root `bun check`; site production build; source design lint and React Doctor; browser checks at desktop/tablet/phone where browser access is available, including brand-mark loading, hover/focus color, pause/resume, and reduced motion. Update the existing draft PR after validation. No release or deployment.

16 October revision: the user requested shared shadcn Select controls in the builder. Replace native selects with the Base UI-backed shadcn primitive while preserving labels, controlled values, disabled auth hints, keyboard behavior, and source gating. This explicit instruction supersedes the earlier native-select preference.
