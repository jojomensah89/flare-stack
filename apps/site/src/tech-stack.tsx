import { useState } from "react";
import { Button } from "@repo/ui";

const glyphFrames = [".:+*", ":.*+"] as const;

type TechCard = {
  id: string;
  category: string;
  name: string;
  detail: string;
  href: string;
  logos: readonly string[];
};

function makeArt(seed: number, frame: number) {
  const glyphs = glyphFrames[frame] ?? glyphFrames[0];
  return Array.from({ length: 32 }, (_, row) =>
    Array.from({ length: 60 }, (_, column) => {
      const cell = (column * 7 + row * 11 + (((column + seed) * (row + 3)) % 17)) % 13;
      return cell === 0 ? " " : glyphs[(column * 5 + row * 3 + seed) % glyphs.length];
    }).join(""),
  ).join("\n");
}

const cards = [
  {
    id: "tanstack",
    category: "Routing and data",
    name: "TanStack",
    detail: "Router, Start and Query",
    href: "https://tanstack.com/",
    logos: ["/stack-logos/tanstack.svg"],
  },
  {
    id: "cloudflare",
    category: "Compute",
    name: "Cloudflare Workers",
    detail: "Run at the edge",
    href: "https://developers.cloudflare.com/workers/",
    logos: ["/stack-logos/cloudflare.svg"],
  },
  {
    id: "effect",
    category: "Backend",
    name: "Effect",
    detail: "Typed TypeScript services",
    href: "https://effect.website/",
    logos: ["/stack-logos/effect.svg"],
  },
  {
    id: "data",
    category: "Database",
    name: "D1 + Drizzle",
    detail: "Cloudflare SQLite with a typed ORM",
    href: "https://orm.drizzle.team/docs/connect-cloudflare-d1",
    logos: ["/stack-logos/cloudflare.svg", "/stack-logos/drizzle.svg"],
  },
  {
    id: "better-auth",
    category: "Authentication",
    name: "Better Auth",
    detail: "Sessions and sign-in",
    href: "https://www.better-auth.com/docs",
    logos: ["/stack-logos/better-auth.svg"],
  },
  {
    id: "interface",
    category: "Interface",
    name: "Base UI + Tailwind v4",
    detail: "Accessible components and styling",
    href: "https://base-ui.com/",
    logos: ["/stack-logos/base-ui.svg", "/stack-logos/tailwind-css.svg"],
  },
  {
    id: "wxt",
    category: "Browser extensions",
    name: "WXT",
    detail: "Build extensions with Vite",
    href: "https://wxt.dev/",
    logos: ["/stack-logos/wxt.svg"],
  },
  {
    id: "neon",
    category: "Database",
    name: "Neon",
    detail: "Serverless Postgres",
    href: "https://neon.com/docs",
    logos: ["/stack-logos/neon.svg"],
  },
] as const satisfies readonly TechCard[];

const artwork = cards.map((card, index) => ({
  ...card,
  frames: [makeArt(index, 0), makeArt(index, 1)],
}));

export function TechStack() {
  const [isPaused, setIsPaused] = useState(false);

  return (
    <section id="tech-stack" className="tech-stack-section" aria-labelledby="tech-stack-title">
      <div className="tech-stack-heading site-width">
        <div>
          <h2 id="tech-stack-title">The stack, already connected.</h2>
          <p>The tools behind every template, from the interface to the edge.</p>
        </div>
        <span className="tech-motion-control">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-pressed={isPaused}
            onClick={() => setIsPaused((paused) => !paused)}
          >
            {isPaused ? "Resume artwork" : "Pause artwork"}
          </Button>
        </span>
      </div>
      <div className={isPaused ? "tech-stack-grid is-paused" : "tech-stack-grid"}>
        {artwork.map((card) => (
          <a
            className="tech-card"
            data-tech={card.id}
            href={card.href}
            target="_blank"
            rel="noreferrer"
            aria-label={`${card.name}: ${card.detail}. Read documentation (opens in a new tab)`}
            key={card.id}
          >
            <span className="tech-card-top">
              <span className="tech-card-category">{card.category}</span>
              <span className="tech-card-arrow" aria-hidden="true">
                ↗
              </span>
            </span>
            <span className="tech-art" aria-hidden="true">
              <pre>{card.frames[0]}</pre>
              <pre className="tech-art-alt">{card.frames[1]}</pre>
              <span className="tech-brand-logos" data-count={card.logos.length}>
                {card.logos.map((logo) => (
                  <img className="tech-brand-mark" src={logo} alt="" key={logo} />
                ))}
              </span>
            </span>
            <span className="tech-card-copy">
              <span className="tech-card-title">{card.name}</span>
              <span className="tech-card-detail">{card.detail}</span>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
