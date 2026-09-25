# CLAUDE.md

This repository is a browser-based product video studio: users import or record a screen recording and turn it into a polished product video (background, device frame, zooms, text, gestures, captions), exported locally in the browser.

The full specification lives in `docs/BUILD.md`. Read it before starting any task. It defines the architecture, data model, phases and acceptance criteria. Section 15 tracks which phase is current.

## Hard rules

- All video decoding, rendering and encoding happen in the browser (WebCodecs, Mediabunny, OffscreenCanvas, Web Workers). Never send media bytes through a Vercel Function.
- One pure function, `renderFrame`, draws both preview and export. Preview and export must match pixel for pixel.
- Times are integer microseconds everywhere in the model.
- `src/engine` imports nothing from React, `src/editor` or `src/store`.
- Close every `VideoFrame`, `AudioData`, decoder and encoder you open.
- Read current library docs before using an API you are not sure of.
- If a decision in `docs/BUILD.md` looks wrong, stop and explain before deviating.

## Commands

- `pnpm dev`: local dev server
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`: Vitest unit tests
- `pnpm e2e`: Playwright tests
- `pnpm build`

## Workflow

- One phase per branch (`phase-N-short-name`), small commits, PR into `main`.
- CI must be green; the Vercel preview URL is where the owner checks acceptance criteria.
- New engine code ships with unit tests in the same PR.
- Update section 15 of `docs/BUILD.md` when a phase is done.
