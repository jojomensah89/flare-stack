---
name: better-ui
description: Polishes and improves the UI in your project. Covers concentric border radius, optical alignment, surface depth, contextual icons, hit areas and more.
---

# UI polish

Polish comes from a pile of small details that compound. This skill is the reference for which are worth having and what values they take.

When reviewing, slow the interface down. What feels off at 10% speed is what is subtly wrong at full speed.

Keep the project's component library, tokens and density, and match its motion language except where a rule below prescribes an exact interaction.

Every duration, curve, scale and blur below is a specific value, not a range to approximate. `cubic-bezier(0.2, 0, 0, 1)` is not `cubic-bezier(0.4, 0, 0.2, 1)`, and `0.96` is not `0.95`. Use what is written.

Text wrapping, font rendering, tabular numbers and text spacing belong to `better-typography`. Hit areas, focus, keyboard support, ARIA and reduced motion belong to `better-accessibility`. Grouping, section spacing, breakpoints and spatial RTL belong to `better-layout`.

## Concentric border radius

Outer radius = inner radius + padding. Mismatched radii on nested elements is the most common thing that makes an interface feel off. Radius, shadow and outline recipes are in [surfaces.md](surfaces.md).

## Optical over geometric alignment

When geometric centering looks off, align optically. Buttons with icons, play triangles and asymmetric icons all need a manual nudge.

## Shadows for elevation, borders for structure

Where a border exists only to create depth, prefer layered transparent `box-shadow` values. Keep borders that communicate structure or state: dividers, separators and selected or focus states.

## Interruptible animations

Use CSS transitions for interactive state changes, because they can be interrupted mid-animation. Reserve keyframes for staged sequences that run once.

## Split and stagger enter animations

For an infrequent staged entrance where sequence communicates hierarchy, break the content into semantic chunks and stagger them by ~100ms. Animating one container gets you less for the same cost. Leave high-frequency interactions unstaggered. See [enter-exit.md](enter-exit.md).

## Subtle exit animations

Use a small fixed `translateY` rather than full height. Exits should be softer than enters. Use `ease-out` for both directions.

## Contextual icon animations

Animate icons with `opacity`, `scale` and `blur` rather than toggling visibility. Use exactly these values: scale `0.25` to `1`, opacity `0` to `1`, blur `4px` to `0px`.

With a motion library (`motion` or `framer-motion` in `package.json`), match that package's import path, or nearby imports where both exist. Use `transition: { type: "spring", duration: 0.3, bounce: 0 }`. Bounce is always `0`.

Without one, keep both icons in the DOM with one absolutely positioned, and cross-fade with `cubic-bezier(0.2, 0, 0, 1)`. That gives you enter and exit with no dependency. Both recipes are in [icon-transitions.md](icon-transitions.md).

## Image outlines

Give images a `1px` outline at low opacity for consistent depth. Pure black in light mode (`oklch(0 0 0 / 0.1)`), pure white in dark (`oklch(1 0 0 / 0.1)`). Never a near-black like slate or zinc and never a tinted neutral. A tinted out
