import { useState } from "react";
import { Button } from "@repo/ui";

type LogoKind = "mountain" | "workers" | "effect" | "database" | "auth" | "ui";

const glyphFrames = [".:+*", ":.*+"] as const;
type Point = readonly [number, number];

function polygon(x: number, y: number, points: readonly Point[]) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!;
    const b = points[j]!;
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0])
      inside = !inside;
  }
  return inside;
}

function nearLine(x: number, y: number, a: Point, b: Point, width = 0.035) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy) < width;
}

// Original silhouettes; a blank cell cuts the mark out of the character field.
function isLogoCutout(kind: LogoKind, x: number, y: number) {
  if (kind === "mountain") {
    return (
      polygon(x, y, [
        [-0.88, 0.65],
        [-0.28, -0.64],
        [0.36, 0.65],
      ]) ||
      polygon(x, y, [
        [-0.1, 0.65],
        [0.43, -0.26],
        [0.9, 0.65],
      ]) ||
      Math.hypot(x - 0.58, y + 0.57) < 0.16
    );
  }
  if (kind === "workers") {
    return (
      polygon(x, y, [
        [-0.88, -0.65],
        [-0.56, -0.65],
        [0.08, 0],
        [-0.56, 0.65],
        [-0.88, 0.65],
        [-0.24, 0],
      ]) ||
      polygon(x, y, [
        [-0.04, -0.65],
        [0.28, -0.65],
        [0.92, 0],
        [0.28, 0.65],
        [-0.04, 0.65],
        [0.6, 0],
      ])
    );
  }
  if (kind === "effect") {
    const cube = polygon(x, y, [
      [0, -0.78],
      [0.72, -0.4],
      [0.72, 0.4],
      [0, 0.78],
      [-0.72, 0.4],
      [-0.72, -0.4],
    ]);
    const seams =
      nearLine(x, y, [0, 0], [0, 0.78]) ||
      nearLine(x, y, [0, 0], [-0.72, -0.4]) ||
      nearLine(x, y, [0, 0], [0.72, -0.4]);
    return cube && !seams;
  }
  if (kind === "database") {
    const ellipse = (cy: number) => (x / 0.66) ** 2 + ((y - cy) / 0.2) ** 2;
    const body =
      (Math.abs(x) < 0.66 && y >= -0.48 && y <= 0.48) || ellipse(-0.48) < 1 || ellipse(0.48) < 1;
    const band = [-0.48, -0.08, 0.3].some((cy) => y >= cy && Math.abs(ellipse(cy) - 1) < 0.18);
    return body && !band;
  }
  if (kind === "auth") {
    const shield = polygon(x, y, [
      [-0.64, -0.59],
      [0, -0.78],
      [0.64, -0.59],
      [0.58, 0.18],
      [0.37, 0.52],
      [0, 0.8],
      [-0.37, 0.52],
      [-0.58, 0.18],
    ]);
    const check =
      nearLine(x, y, [-0.3, 0], [-0.08, 0.24], 0.06) ||
      nearLine(x, y, [-0.08, 0.24], [0.34, -0.24], 0.06);
    return shield && !check;
  }
  const tile = polygon(x, y, [
    [-0.8, -0.62],
    [-0.12, -0.62],
    [-0.12, 0.62],
    [-0.8, 0.62],
  ]);
  const slots =
    nearLine(x, y, [-0.64, -0.26], [-0.28, -0.26], 0.04) ||
    nearLine(x, y, [-0.64, 0.04], [-0.4, 0.04], 0.04);
  const wave = [-0.24, 0.3].some(
    (offset) =>
      x > 0.08 && x < 0.86 && Math.abs(y - offset - 0.11 * Math.sin((x - 0.08) * 8)) < 0.09,
  );
  return (tile && !slots) || wave;
}

function makeArt(kind: LogoKind, frame: number) {
  const glyphs = glyphFrames[frame] ?? glyphFrames[0];
  return Array.from({ length: 32 }, (_, row) =>
    Array.from({ length: 72 }, (_, column) => {
      if (isLogoCutout(kind, (column / 71) * 2 - 1, (row / 31) * 2 - 1)) return " ";
      return glyphs[(column * 7 + row * 11 + ((column * row) % 13)) % glyphs.length];
    }).join(""),
  ).join("\n");
}

type TechCard = {
  name: string;
  detail: string;
  description: string;
  href: string;
  art: LogoKind;
};

const cards = [
  {
    name: "TanStack",
    detail: "Router, Start & Query",
    description:
      "Type-safe routes and server rendering, with focused tools for data on the client.",
    href: "https://tanstack.com/",
    art: "mountain",
  },
  {
    name: "Cloudflare Workers",
    detail: "Edge runtime",
    description: "Service-bound APIs and web apps on Cloudflare’s edge.",
    href: "https://developers.cloudflare.com/workers/",
    art: "workers",
  },
  {
    name: "Effect",
    detail: "Typed services",
    description: "Composable, typed building blocks for reliable server-side work.",
    href: "https://effect.website/",
    art: "effect",
  },
  {
    name: "D1 + Drizzle",
    detail: "Data layer",
    description: "Cloudflare’s SQLite database paired with a typed TypeScript ORM.",
    href: "https://developers.cloudflare.com/d1/",
    art: "database",
  },
  {
    name: "Better Auth",
    detail: "Authentication",
    description: "Authentication and session management configured for D1.",
    href: "https://www.better-auth.com/docs",
    art: "auth",
  },
  {
    name: "Base UI + Tailwind",
    detail: "Interface layer",
    description: "Accessible unstyled primitives with utility-first styling and shared tokens.",
    href: "https://base-ui.com/",
    art: "ui",
  },
] as const satisfies readonly TechCard[];

const artwork = cards.map((card) => ({
  ...card,
  frames: [makeArt(card.art, 0), makeArt(card.art, 1)],
}));

export function TechStack() {
  const [isPaused, setIsPaused] = useState(false);

  return (
    <section className="tech-stack-section site-width" aria-labelledby="tech-stack-title">
      <div className="tech-stack-heading">
        <div>
          <h2 id="tech-stack-title">The stack, already connected.</h2>
          <p>One clear path from interface to edge and data.</p>
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
            href={card.href}
            target="_blank"
            rel="noreferrer"
            aria-label={`${card.name}: ${card.detail}. Read documentation (opens in a new tab)`}
            key={card.name}
          >
            <span className="tech-art" aria-hidden="true">
              <pre>{card.frames[0]}</pre>
              <pre className="tech-art-alt">{card.frames[1]}</pre>
            </span>
            <span className="tech-card-copy">
              <span className="tech-card-title">{card.name}</span>
              <span className="tech-card-detail">{card.detail}</span>
              <span className="tech-card-description">{card.description}</span>
              <span className="tech-card-link">
                Explore documentation <span aria-hidden="true">↗</span>
              </span>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
