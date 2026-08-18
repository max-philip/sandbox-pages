# sandbox

A small React + Cloudflare Workers playground. Deployed as a single Worker that serves the static SPA and a tiny API.

## Pages

- **home** — landing page.
- **clock** — current time synced against the server, using a Cristian's-algorithm-style round-trip sync (`src/lib/timeSync.ts`) so the displayed time isn't just the device's local clock.
- **wheel** — spin-the-wheel picker; add options, spin, get a winner. Entries persist in `localStorage`.

## Stack

- **React 19 + React Router** (`src/main.tsx`) — a single `BrowserRouter` mounted at the root, routing between the three pages. No server-side rendering; the Worker just serves the built SPA.
- **Vite** (`vite.config.ts`) — dev server and bundler, via `@vitejs/plugin-react` (Fast Refresh) and `@cloudflare/vite-plugin`, which runs the Worker locally alongside the Vite dev server so `/api/*` requests are handled the same way in dev and production.
- **SCSS modules** — each page/component has a co-located `*.module.scss`; class names are scoped locally and imported as objects (e.g. `styles.page`).
- **Cloudflare Workers** — `worker/index.ts` is the Worker entrypoint (set as `main` in `wrangler.jsonc`). It handles `/api/time` directly and delegates everything else to the `ASSETS` binding, which serves the built static files and falls back to `index.html` for unmatched paths (`assets.not_found_handling: "single-page-application"` in `wrangler.jsonc`), so client-side routes resolve correctly on a hard refresh.
- **TypeScript**, split into three project references (`tsconfig.app.json` for `src/`, `tsconfig.node.json` for Vite config, `tsconfig.worker.json` for `worker/`) composed via the root `tsconfig.json`. `pnpm build` runs `tsc -b` across all of them before building.

## API

`GET /api/time` — used by the clock page's server sync (`src/lib/timeSync.ts`). No-cache, no request body.

```json
{ "t": 1787095883043 }
```

`t` is `Date.now()` on the Worker, in Unix ms.

## Linting

Linting is handled by [Oxlint](https://oxc.rs), configured in `.oxlintrc.json` with the `react`, `typescript`, and `oxc` plugin rule sets. Two rules are set explicitly: `react/rules-of-hooks` (error) and `react/only-export-components` (warn, allowing constant exports). Everything else runs at the plugins' defaults. Run it with:

```sh
pnpm lint
```

Type-aware lint rules aren't enabled — Oxlint runs on syntax alone, with `tsc -b` (via `pnpm build`) as the separate type-checking pass.

## Development

```sh
pnpm install
pnpm dev        # local dev server
pnpm build      # typecheck + production build
pnpm preview    # build, then preview via Vite
pnpm lint       # oxlint
pnpm cf-typegen # regenerate worker-configuration.d.ts from wrangler.jsonc
```

## Deploy

```sh
pnpm deploy    # build + wrangler deploy
```

Requires `wrangler login` first. Worker config lives in `wrangler.jsonc`.
