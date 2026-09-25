# Product Video Studio (working name)

A browser-based studio that turns a raw screen recording into a polished product video. All decoding, rendering and encoding happen in the browser.

The spec is [docs/BUILD.md](docs/BUILD.md). Contributor and agent rules are in [CLAUDE.md](CLAUDE.md).

## Getting started

Requires Node 22+ and pnpm (the version is pinned in `package.json`).

```sh
pnpm install
pnpm dev          # http://localhost:3000
```

| Command | What it does |
|:---|:---|
| `pnpm lint` | ESLint, including the `src/engine` import boundary |
| `pnpm typecheck` | Generates Next route types, then `tsc --noEmit` |
| `pnpm test` | Vitest unit tests (`tests/unit`) |
| `pnpm e2e` | Playwright tests (`tests/e2e`); starts `pnpm dev` unless `PLAYWRIGHT_BASE_URL` is set |
| `pnpm build` | Production build |

The first `pnpm e2e` run needs a browser: `pnpm exec playwright install chromium`.
