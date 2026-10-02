# Browser Extension Workspace Instructions

This workspace contains the browser extension built with WXT and React 19.

## Architecture

- Entrypoints live under `entrypoints/`:
  - `popup/`: Toolbar popup UI (HTML, React root, and popup components).
  - `background.ts`: Manifest V3 service worker for handling background tasks and extension events.
- Styling: Tailwind CSS v4 using shared design tokens and primitives from `@repo/ui`.
- Framework: WXT (Web Extension Tools) with `@wxt-dev/module-react`.

## Commands

- `bun dev` - run extension development server with hot module reload in target browser
- `bun run build` - build production extension bundle
- `bun run zip` - package the Chrome Manifest V3 archive
- `bun run package` from the project root - package Chrome, Firefox, and Edge Manifest V3 archives

## Backend Policy

The v1 extension preset is extension-only. It has no Cloudflare backend deployable. If this product requires an authenticated backend or database, start a separate `worker` or `fullstack` Flare project and share packages deliberately.
