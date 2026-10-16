# Animated ASCII tech stack

Approved in the conversation: six permanent cards, subtle continuous ASCII shimmer with stronger hover/focus response, fixed responsive grid, parchment theme. Cards: TanStack (Start/Router/Query), Cloudflare Workers, Effect, D1 + Drizzle, Better Auth, Base UI + Tailwind.

Place the section between the hero and the existing builder. Original code-native character drawings evoke the tools; Rubik and the supplied screenshot inform the treatment rather than supplying runtime code or scroll effects. Card text identifies the real tools. Links lead to official documentation and provide keyboard focus feedback. Logos remain recognizable while decorative character layers animate. Card positions never animate.

Use the existing CSS-variable palette and type. Three columns on desktop, two on tablet, one on narrow phones. No carousel, sticky section, scroll-linked animation, or smooth anchor scrolling. Include a native pause/resume control and honor reduced motion by showing static art. Avoid per-frame React updates, new dependencies, and canvas.

Implementation: isolate the artwork/data/rendering in tech-stack.tsx and its styles in tech-stack.css; import the section into site.tsx and remove global smooth scrolling in site.css. Preserve the builder and unrelated local work.

Validation: root bun check; site production build; source design lint and React Doctor; browser checks at desktop/tablet/phone where browser access is available, including pause/resume, keyboard focus, and reduced motion. Update the existing draft PR after validation. No release or deployment.

16 October revision: the user requested shared shadcn Select controls in the builder. Replace native selects with the Base UI-backed shadcn primitive while preserving labels, controlled values, disabled auth hints, keyboard behavior, and source gating. This explicit instruction supersedes the earlier native-select preference.
