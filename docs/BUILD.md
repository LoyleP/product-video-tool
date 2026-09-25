# BUILD.md: Browser-based product video studio

Working name: `{{APP_NAME}}` (placeholder, replace once the brand is defined).

This document is the source of truth for building the product. Claude Code must read it fully before starting any phase, work one phase at a time, and not start a phase until the previous phase meets its acceptance criteria.

## 1. Product definition

### 1.1 One-line pitch

A web app that turns a raw screen recording of an app or website into a polished product video: framed in a device or window, placed on a designed background, with smooth zooms, text callouts, gesture indicators and captions, exported in high quality straight from the browser.

### 1.2 Reference product

Matte (https://matte.app) is the functional reference. It is a native macOS app that records the iOS simulator, live devices or any window, then adds device frames, backgrounds, a multitrack timeline, auto zoom, text overlays, taps and swipes, on-device captions, presets and 4K export (HEVC, H.264, ProRes, GIF, alpha). Its free tier includes every feature with a watermark; paid tiers remove it.

We reproduce the workflow and quality bar, not the brand. Do not reuse Matte's name, copy, preset artwork, icons or visual identity.

### 1.3 Target users

Indie developers, product designers and small startups who need App Store previews, landing page loops, social clips and launch videos without learning After Effects.

### 1.4 Core user flow

1. User lands on the app, drops a video file (or records their screen in the browser).
2. The editor opens with a sensible default composition: background, padding, rounded corners, shadow, optional device frame.
3. User trims, adds zooms (manual or suggested), text, taps, captions.
4. User picks export settings and exports locally. Nothing is uploaded unless the user explicitly saves to the cloud or shares.

## 2. Non-negotiable architecture decisions

These decisions are fixed. Do not change them without an explicit instruction from the owner.

### 2.1 All media processing happens in the browser

Decoding, compositing, preview and encoding run client-side with WebCodecs, OffscreenCanvas and Web Workers. Vercel hosts the app, API routes, auth and metadata; it never renders video.

Reasons:
- Vercel Functions have a hard 4.5 MB request body limit on every plan, so raw recordings cannot pass through them.
- Functions are designed as a lightweight API layer, not a media server.
- Client-side rendering costs nothing per export, keeps user recordings private, and matches the "nothing gets uploaded" promise that Matte uses as a selling point.

When files must reach storage (cloud save, share links), use Vercel Blob client uploads: the browser uploads directly to Blob after a token exchange with our server. Authentication and authorization must happen in `onBeforeGenerateToken`, otherwise anyone can write to the store.

### 2.2 Media library: Mediabunny

Use `mediabunny` for demuxing, decoding, encoding and muxing. It is a zero-dependency TypeScript toolkit built on WebCodecs that reads and writes MP4, MOV, WebM and more, with hardware-accelerated encoding and decoding and microsecond-accurate operations.

Do not use `ffmpeg.wasm` in the main pipeline (slow, large, requires cross-origin isolation for threads). It may be considered later only for niche format conversion.

Before writing any Mediabunny code, fetch the current docs at https://mediabunny.dev and verify class names and signatures. Expected building blocks (verify): `Input`, `BlobSource`, `ALL_FORMATS`, `VideoSampleSink` or `CanvasSink` for decoding; `Output`, `Mp4OutputFormat`, `WebMOutputFormat`, `BufferTarget` or `StreamTarget`, `CanvasSource`, `AudioBufferSource` for encoding; `MediaStreamVideoTrackSource` for live recording; codec support helpers such as `canEncodeVideo`.

### 2.3 Our own compositor, not Remotion

Build a custom, framework-free rendering engine. Remotion is a strong alternative but it is source-available with a license that requires a paid Company License once the owning organization has 4 or more people, with a 100 USD per month minimum for companies shipping video editors. A custom engine also gives full control over performance and the export loop. Revisit only if the engine becomes a bottleneck to shipping.

### 2.4 One render function for preview and export

The single most important engineering rule:

```ts
renderFrame(target: RenderTarget, project: Project, t: Micros, frames: FrameProvider): void
```

- Pure with respect to `project` and `t`: same inputs, same pixels.
- Used by the live preview (at display rate) and by the exporter (frame by frame, at output resolution).
- No React, no DOM access, no `Date.now()`, no randomness without a seed.
- Runs on `OffscreenCanvas` in a worker for export; can run on main thread canvas for preview in early phases, then move to a worker.

If preview and export ever differ visually, it is a bug in this rule.

### 2.5 Time representation

All times are integer microseconds (`type Micros = number`). Never store seconds as floats in the project model. Convert only at UI boundaries.

### 2.6 Rendering backend

Start with Canvas 2D for everything (backgrounds, rounded corners, shadows, device frames, text). Introduce WebGL (via raw WebGL2 or `three`) only in the phase that adds 3D device tilt and motion blur. Keep the layer interface identical so layers can be migrated one by one.

## 3. Tech stack

| Concern | Choice |
|:---|:---|
| Framework | Next.js (App Router), TypeScript strict |
| Package manager | pnpm (set `packageManager` in `package.json`) |
| Styling | Tailwind CSS, shadcn/ui for primitives |
| Editor state | Zustand with Immer, undo and redo via `zundo` (or a custom command stack) |
| Media | mediabunny, WebCodecs, OffscreenCanvas, Web Workers (via `comlink`) |
| Local persistence | OPFS for media files, IndexedDB (via `idb`) for project JSON |
| Transcription | `@huggingface/transformers` running a timestamped Whisper model in a worker, WebGPU with WASM fallback |
| GIF export | `gifenc` |
| Validation | `zod` for the project schema and API payloads |
| Tests | Vitest (unit), Playwright (e2e) |
| Hosting | Vercel, GitHub repository, preview deploy per PR |
| Cloud storage (later) | Vercel Blob with client uploads |
| Database and auth (later) | Supabase (Postgres plus Auth) via the Vercel Marketplace, or Neon plus Auth.js; decide at Phase 7 |
| Payments (later) | Polar or Stripe; decide at Phase 7 |

Note on Remotion packages: `@remotion/whisper-webgpu` wraps the same Transformers.js approach but falls under the Remotion license. Use Transformers.js directly.

## 4. Browser support

- Primary target: desktop Chromium (Chrome, Edge, Arc, Brave), latest two versions.
- Secondary: desktop Safari and Firefox. Must load, import and preview; export must work where WebCodecs encoders exist, otherwise show a clear message.
- Mobile browsers: view and share pages only. Show a "use a desktop browser" screen in the editor.
- Every capability is feature-detected at startup (`VideoEncoder`, `OffscreenCanvas`, `getDisplayMedia`, WebGPU) and stored in a `capabilities` object. Never sniff user agents.

## 5. Repository structure

```
/
├─ CLAUDE.md
├─ docs/BUILD.md                # this file
├─ app/
│  ├─ (marketing)/page.tsx      # landing page
│  ├─ editor/page.tsx           # new project / import screen
│  ├─ editor/[projectId]/page.tsx
│  └─ api/
│     ├─ blob/upload/route.ts   # client upload token exchange (Phase 7)
│     └─ health/route.ts
├─ src/
│  ├─ engine/                   # pure TypeScript, zero React imports
│  │  ├─ time.ts                # Micros helpers, frame index math
│  │  ├─ easing.ts              # cubic-bezier, spring
│  │  ├─ camera.ts              # zoom and pan resolution at time t
│  │  ├─ render-frame.ts        # the single render entry point
│  │  ├─ layers/
│  │  │  ├─ background.ts
│  │  │  ├─ media.ts            # the recording itself, with crop, radius, shadow
│  │  │  ├─ device-frame.ts
│  │  │  ├─ text.ts
│  │  │  ├─ gestures.ts         # taps and swipes
│  │  │  ├─ captions.ts
│  │  │  └─ watermark.ts
│  │  ├─ decode/                # Mediabunny input, frame cache (LRU)
│  │  ├─ export/                # export worker, encoder config, progress
│  │  ├─ record/                # getDisplayMedia and webcam capture
│  │  ├─ analysis/              # motion analysis for auto zoom
│  │  └─ captions/              # whisper worker
│  ├─ editor/                   # React UI
│  │  ├─ preview/               # canvas, playback loop, transport controls
│  │  ├─ timeline/
│  │  ├─ inspector/             # right panel: style, zoom, text, export
│  │  └─ import/
│  ├─ store/                    # zustand stores, commands, undo
│  ├─ storage/                  # OPFS, IndexedDB, schema migrations
│  ├─ schema/                   # zod schemas for Project
│  └─ lib/                      # capabilities, utils
├─ public/
│  ├─ devices/                  # device frame SVGs + JSON metadata (screen rect, radius)
│  └─ backgrounds/              # bundled wallpapers and gradients
├─ tests/
│  ├─ unit/
│  └─ e2e/
└─ .github/workflows/ci.yml
```

Rule: `src/engine` must never import from `src/editor`, `src/store` or `react`. Enforce with an ESLint `no-restricted-imports` rule.

## 6. Data model

Implement in `src/schema/project.ts` with zod, and derive TypeScript types from it.

```ts
type Micros = number;

type Easing =
  | { type: "cubic-bezier"; p: [number, number, number, number] }
  | { type: "spring"; stiffness: number; damping: number; mass: number };

interface Project {
  id: string;
  schemaVersion: 1;
  name: string;
  createdAt: string;
  updatedAt: string;
  canvas: { width: number; height: number; fps: 30 | 60 };
  assets: Record<string, MediaAsset>;
  videoTracks: VideoTrack[];     // max 4
  audioTracks: AudioTrack[];     // max 4
  textTracks: TextTrack[];       // max 5
  zooms: ZoomSegment[];
  gestures: Gesture[];
  captions: CaptionTrack | null;
  style: CompositionStyle;
  export: ExportSettings;
}

interface MediaAsset {
  id: string;
  kind: "video" | "audio" | "image";
  name: string;
  storage: { type: "opfs"; path: string } | { type: "blob"; url: string };
  width?: number;
  height?: number;
  duration: Micros;
  hasAudio: boolean;
  codec: string;
  isVariableFrameRate: boolean;
  interactionEvents?: InteractionEvent[]; // only from the browser extension recorder
}

interface Clip {
  id: string;
  assetId: string;
  timelineStart: Micros;
  sourceIn: Micros;
  sourceOut: Micros;
  speed: number;          // 0.25 to 8
  muted: boolean;
}

interface VideoTrack { id: string; clips: Clip[]; hidden: boolean; }
interface AudioTrack { id: string; clips: Clip[]; volume: number; muted: boolean; }

interface ZoomSegment {
  id: string;
  start: Micros;
  end: Micros;
  scale: number;                     // 1 to 4
  focus: { x: number; y: number };   // normalized 0..1 in source frame space
  easeIn: Easing;
  easeOut: Easing;
  origin: "manual" | "auto";
}

interface TextLayer {
  id: string;
  start: Micros;
  end: Micros;
  text: string;
  box: { x: number; y: number; w: number; h: number }; // normalized to canvas
  font: { family: string; size: number; weight: number; lineHeight: number; letterSpacing: number };
  color: string;
  align: "left" | "center" | "right";
  animIn: TextAnimation;
  animOut: TextAnimation;
}
interface TextTrack { id: string; layers: TextLayer[]; }

interface Gesture {
  id: string;
  time: Micros;
  type: "tap" | "swipe";
  from: { x: number; y: number };   // normalized source space
  to?: { x: number; y: number };
  style: "ripple" | "dot";
}

interface CompositionStyle {
  background:
    | { type: "solid"; color: string }
    | { type: "gradient"; stops: { color: string; at: number }[]; angle: number }
    | { type: "image"; assetId: string; blur: number }
    | { type: "transparent" };
  padding: number;            // fraction of canvas
  cornerRadius: number;       // px at canvas resolution
  shadow: { blur: number; offsetY: number; opacity: number };
  device: { frameId: string; color: string } | null;
  zoomBackgroundBlur: number; // 0 disables
  tilt3d: { rotateX: number; rotateY: number; perspective: number } | null; // Phase 9
  watermark: boolean;
}

interface ExportSettings {
  preset: "1080p" | "1440p" | "4k" | "custom";
  width: number;
  height: number;
  fps: 30 | 60;
  format: "mp4-h264" | "webm-vp9" | "webm-vp9-alpha" | "gif" | "png-still";
  quality: "standard" | "high" | "lossless-ish";
  range: { start: Micros; end: Micros } | null;
}
```

Schema versioning: every persisted project carries `schemaVersion`. Add a migration function per version bump in `src/storage/migrations.ts`.

## 7. Engine details

### 7.1 Decoding and the frame provider

- On import, open the file with Mediabunny, read metadata, detect variable frame rate. Screen recordings (QuickTime, iOS screen recording, getDisplayMedia) are frequently VFR.
- Never assume constant frame rate. To get the frame at timeline time `t`: map `t` to source time via the clip (`sourceIn + (t - timelineStart) * speed`), then fetch the latest sample whose timestamp is less than or equal to that source time.
- `FrameProvider` keeps an LRU cache of decoded frames (bounded by memory, for example 60 frames at 1080p). Every `VideoFrame` must be `.close()`d when evicted. Leaking frames stalls the decoder; treat any unclosed frame as a critical bug.
- For scrubbing, decode from the nearest keyframe; show the last good frame while seeking.
- iPhone recordings are often HEVC. Decode support depends on the browser and hardware. If decoding fails, show an explicit error with the recommendation to re-export as H.264, never a silent failure.

### 7.2 Composition order (back to front)

1. Background (solid, gradient, image with blur, or transparent).
2. Camera transform applied to everything below except the background (zoom and pan).
3. Media shadow.
4. Media layer: the recording, clipped to rounded rect or to the device screen rect.
5. Device frame overlay (vector paths, see 7.9).
6. Gestures (taps and swipes, in source space so they zoom with the content).
7. Text layers (canvas space, unaffected by zoom).
8. Captions (canvas space).
9. Watermark (canvas space, free plan only).

When `zoomBackgroundBlur > 0` and zoom scale is above 1, blur the background proportionally to zoom progress.

### 7.3 Camera and zoom

- `camera.ts` exposes `resolveCamera(zooms, t): { scale, cx, cy }`.
- Between segments the camera rests at scale 1, centered.
- Transition in: from rest to segment target over a default of 600 ms using `easeIn`; transition out likewise with `easeOut`. Consecutive segments closer than 300 ms interpolate directly from one target to the next without returning to scale 1.
- Clamp the focus so the zoomed viewport never shows beyond the media edges.
- Default easing: a critically damped spring. Also offer three bezier presets (smooth, snappy, linear).
- Unit test `resolveCamera` exhaustively: boundaries, overlapping segments (reject at the store level), back-to-back segments, clamping.

### 7.4 Export pipeline

Runs entirely in a dedicated worker:

1. Receive the serialized project plus asset handles (OPFS paths or File objects).
2. Create an `OffscreenCanvas` at the export resolution.
3. For frame index `i` from 0 to N: `t = rangeStart + i * (1_000_000 / fps)`, call `renderFrame`, then feed the canvas to the Mediabunny `CanvasSource` with timestamp and duration.
4. Audio: mix all audio clips (with speed changes and volume) into an `AudioBuffer` via `OfflineAudioContext`, then encode via `AudioBufferSource` as AAC (MP4) or Opus (WebM).
5. Report progress every frame; support cancellation; write output via `StreamTarget` to OPFS for long exports to avoid holding the whole file in memory, then offer download.
6. Before starting, check encoder support for the chosen codec and resolution. If 4K H.264 is not supported by the hardware encoder, fall back to software encoding if available, otherwise propose 1440p.

Formats:
- MP4 H.264 plus AAC: default.
- WebM VP9 plus Opus.
- WebM VP9 with alpha: only when background is transparent and the browser reports alpha encoding support. Detect at runtime; hide the option otherwise.
- GIF: render at reduced fps (15 default) and width (max 960) with `gifenc`; warn above 20 seconds.
- PNG still: render one frame at the playhead and download, plus copy to clipboard via `ClipboardItem`.

Motion blur (Phase 9): export only. Render K subframes per output frame across a shutter window (default K = 8, 180 degree shutter) and average them in WebGL. Preview never uses motion blur.

### 7.5 Recording in the browser (Phase 5)

- Use `getDisplayMedia` for screen, window or tab, `getUserMedia` for webcam and microphone.
- Encode live with Mediabunny's media stream sources into MP4 or WebM written to OPFS, not with `MediaRecorder`, because MediaRecorder output often lacks duration metadata and seeks poorly.
- Cursor control via the `cursor` constraint is not honored consistently across browsers; Chromium does not yet expose the full constraint surface. Always read back `track.getSettings().cursor` and store it.
- Hard platform limit: a web page cannot read the cursor position outside its own tab. This means Screen Studio or Matte style cursor smoothing, cursor restyling and click-driven auto zoom are impossible for general screen recordings made in the browser or for uploaded files. The cursor is baked into the pixels. Design around this; do not try to fake it.

### 7.6 Auto zoom (Phase 6)

Because cursor telemetry is usually unavailable, auto zoom works in two modes:

Mode A, motion analysis (works on any video):
1. In a worker, decode the video at about 10 fps, downscale to 160 px wide, convert to grayscale.
2. Diff consecutive frames, threshold, and compute per step the bounding box and magnitude of changed pixels.
3. Classify steps: full-frame change (scroll, page transition, above 60 percent of area) is ignored; localized change (below 35 percent of area) is activity.
4. Group consecutive localized steps into activity windows longer than 400 ms; merge windows closer than 700 ms if their centers are near.
5. For each window, propose a `ZoomSegment` with focus at the weighted center, scale `clamp(0.7 / max(bboxW, bboxH), 1.4, 2.5)`, `origin: "auto"`.
6. Show proposals on the timeline as ghost segments that the user accepts, edits or dismisses individually or all at once.

Mode B, interaction events (precise, websites only, Phase 10): a companion Chrome extension records the page and logs clicks, focus changes and scrolls with timestamps into `interactionEvents`. Auto zoom then targets real click positions and can render a synthetic, restyled cursor.

### 7.7 Gestures

Manual placement in Phase 4: user clicks on the preview at the playhead to add a tap, or drags to add a swipe. Rendered as an animated ripple or dot (about 350 ms). Positions are in source space so they follow zoom.

### 7.8 Captions (Phase 8)

- Extract audio, resample to 16 kHz mono via `OfflineAudioContext`.
- Run a Transformers.js ASR pipeline with an `onnx-community/whisper-*_timestamped` model and `return_timestamps: "word"` in a worker, WebGPU if available, WASM otherwise. Default model: base; offer small for accuracy.
- Word-level timestamps with WebGPU have had bugs in some Transformers.js versions. Pin the version, write an integration test with a known audio sample, and fall back to WASM if word timestamps come back empty.
- Model download (tens of MB) happens on first use with a progress UI and is cached by the browser.
- Transcript editor: word-by-word editing that keeps timings; caption styles (position, font, highlight current word).

### 7.9 Device frames

- Store frames as SVG plus JSON metadata: outer size, screen rect, screen corner radius, notch or island mask, available colors.
- Implemented as vector drawing code plus metadata in `src/engine/devices.ts` rather than SVG files: workers can't decode SVG images, and the export renders in a worker. Canvas paths also stay sharp at any zoom, and the screen cutout and media placement come from the same numbers, which guarantees alignment.
- Draw original, generic device frames (modern phone, tablet, laptop, browser window with light and dark chrome) for launch. Apple's official product imagery and design resources have their own license terms; the owner must review them before any Apple-branded bezel ships.
- Auto-suggest a frame from the video aspect ratio (for example 1179 by 2556 suggests a modern phone).

## 8. Editor UI

Three-zone layout on desktop, minimum width 1280 px:

- Left rail: presets and backgrounds gallery.
- Center: preview canvas with transport controls, and the timeline below it (tracks: video, zooms, gestures, text, captions, audio).
- Right: inspector with contextual panels (Style, Zoom, Text, Gesture, Export).

Interaction requirements:
- Keyboard: Space play and pause, J K L shuttle, S split at playhead, Z add zoom at playhead, T add text, Delete removes selection, Cmd or Ctrl plus Z and Shift plus Z for undo and redo.
- Timeline: zoomable, snapping to playhead, clip edges and segment edges; drag to move, drag edges to trim.
- Every mutation goes through a command in the store so undo and redo are always correct.
- Autosave the project to IndexedDB, debounced at 1 second.
- Presets: a preset is a partial `CompositionStyle` plus optional text style. Ship 8 original presets; users can save their own locally.

Design direction: minimal, dark UI by default, strong typography, the video is the hero. Treat the editor chrome as a neutral frame around the content.

## 9. Deployment pipeline: GitHub and Vercel

### 9.1 Initial setup (owner does this once, Claude Code guides)

1. Scaffold locally with `pnpm create next-app` (TypeScript, ESLint, Tailwind, App Router, `src` directory).
2. Create a GitHub repository (public, so GitHub Actions minutes are free) and push `main`.
3. In Vercel, import the GitHub repository. The Next.js framework preset is detected automatically. Production branch: `main`.
4. Every pull request then gets its own Preview deployment URL automatically; merging into `main` deploys to production.
5. In GitHub, protect `main`: require a pull request and require the `Vercel` check to pass (see 9.2).
6. Locally, run `vercel link` then `vercel env pull .env.local` to sync environment variables.
7. Phase 7 only: in the Vercel project, Storage tab, create a Blob store. Vercel adds `BLOB_READ_WRITE_TOKEN` to the project environment.

### 9.2 CI workflow

Current setup: GitHub Actions is unavailable on the owner's account, so the Vercel build is the CI gate. `vercel.json` sets the build command to `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, so any failing check fails the deployment and the `Vercel` status on the PR. The Actions workflow below stays in the repo and runs again automatically once Actions is available. Until then, run `pnpm e2e` locally before merging.

`.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
```

`package.json` scripts: `dev`, `build`, `start`, `lint`, `typecheck` (runs `tsc` with `noEmit` from tsconfig), `test` (`vitest run`), `e2e` (`playwright test`).

Phase 3 onward: add a second job that runs Playwright against the Vercel preview URL (use the `deployment_status` event), covering import, edit, export of a 3 second fixture video. Blocked while GitHub Actions is unavailable on the owner's account: run `pnpm e2e` locally before merging, or `PLAYWRIGHT_BASE_URL=<preview url> pnpm e2e` against a preview.

### 9.3 Headers

Do not enable cross-origin isolation (COOP and COEP) by default; the WebCodecs pipeline does not need `SharedArrayBuffer`, and COEP breaks third-party embeds. Enable it later only if a feature proves it needs it.

### 9.4 Environment variables

Keep a committed `.env.example` listing every variable with a comment. Never commit real values.

## 10. Build phases

Each phase ends with a PR, a green CI, a working Vercel preview, and the acceptance criteria below checked manually by the owner.

### Phase 0: Foundation
Scaffold, Tailwind, shadcn/ui, ESLint boundaries rule, Vitest, Playwright, CI, Vercel link, capability detection, landing page placeholder, `/editor` route with a "desktop only" guard.
Accept: preview URL loads; CI green; capabilities are logged in a debug panel.

### Phase 1: Import and static composition
Drag and drop import (MP4, MOV, WebM), metadata read, OPFS storage, project creation, preview canvas showing the first frame composited with background, padding, radius, shadow. Style inspector with live updates.
Accept: a 60 second iPhone H.264 recording and a 1440p Mac window recording both import and display correctly composited within 2 seconds of drop.

### Phase 2: Playback and export (MVP)
Playback loop with audio sync, trim in and out, export MP4 H.264 at 1080p, 1440p, 4K with progress and cancel.
Accept: exported file plays in QuickTime and Chrome, correct duration, audio in sync within one frame, visually identical to preview; 30 seconds of 1080p30 exports in under 30 seconds on an Apple Silicon Mac in Chrome.

### Phase 3: Timeline and zoom
Timeline UI, split, clip speed, multiple clips, manual zoom segments with easing presets, zoom background blur, undo and redo, autosave, reopen projects.
Accept: all keyboard shortcuts work; undo restores any edit exactly; zoom transitions are smooth at 60 fps preview.

### Phase 4: Device frames, text, gestures, presets
Four original device frames, text layers with in and out animations and a resizable reflowing box, manual taps and swipes, 8 presets, save custom preset.
Accept: text renders identically in preview and export; frames align pixel-exact with the screen area.

### Phase 5: Browser recording
Screen, window or tab capture with optional webcam overlay (circle or rounded rect) and microphone, recorded straight into a new project.
Accept: a 5 minute 1080p recording completes without dropped audio and opens in the editor without re-import.

### Phase 6: Auto zoom by motion analysis
Implement 7.6 Mode A with ghost proposals on the timeline.
Accept: on a set of 5 reference recordings, at least 70 percent of proposals are accepted as useful by the owner.

### Phase 7: Accounts, cloud, watermark, billing
Auth, cloud project save (JSON in Postgres, media in Vercel Blob via client uploads), share links with a hosted player page, free plan watermark, paid plan checkout.
Accept: the upload route rejects unauthenticated token requests; a shared link plays on mobile.
Note: because rendering is client-side, the watermark is enforceable only against casual users. Accept that trade-off or add server-verified export tokens later.

### Phase 8: Captions
Implement 7.8.
Accept: a 2 minute English voiceover transcribes locally in under 2 minutes on Apple Silicon Chrome; captions export burned-in.

### Phase 9: Polish
3D device tilt with animatable rotation, motion blur on export, WebM with alpha, GIF export, PNG stills, export range, custom animation curves editor.

### Phase 10: Chrome extension recorder
Records a tab plus interaction events; enables precise auto zoom and a synthetic restyled cursor for website demos.

## 11. Quality bars and performance budgets

- Preview: 60 fps at 1080p canvas on Apple Silicon in Chrome with background, device frame, zoom and two text layers.
- Scrub latency: under 150 ms to show the target frame.
- Memory: no growth across 10 consecutive exports of the same project (check in DevTools).
- Accessibility: all editor controls are keyboard reachable with visible focus; color contrast AA for UI text.
- Error handling: every failure in decode, encode, storage quota or permission shows a human-readable message with a next step.

## 12. Testing strategy

- Unit (Vitest): `time.ts`, `easing.ts`, `camera.ts`, clip time mapping, timeline commands, schema migrations, motion analysis on synthetic frame arrays.
- Golden frame tests: render fixed projects at fixed times into an OffscreenCanvas (in Playwright, real Chromium) and compare against stored PNGs with a small tolerance.
- E2E (Playwright): import fixture, apply preset, add zoom, export, verify file duration and dimensions by reading it back with Mediabunny.
- Fixtures in `tests/fixtures`: short H.264 MP4, VFR MOV, WebM, a clip with audio, a portrait phone recording.

## 13. Known risks

1. Cursor data is unavailable for most inputs (see 7.5). This is the biggest functional gap versus native tools. Mitigations: motion-based auto zoom, manual gestures, the extension in Phase 10, and possibly a desktop helper app later.
2. HEVC input support varies by browser and hardware.
3. VFR sources cause drift if frame rate is assumed. Always map by timestamp.
4. Encoder availability at 4K varies. Always check before export.
5. Storage quotas: OPFS space is limited per origin; check `navigator.storage.estimate()` before import and export, and offer cleanup.
6. Safari and Firefox WebCodecs gaps. Feature-detect, degrade explicitly.
7. Device frame licensing (see 7.9).

## 14. Rules for Claude Code

- Work one phase at a time, on a branch named `phase-N-short-name`, with small commits.
- Before using any library API you are not certain about (Mediabunny, Transformers.js, Vercel Blob, Next.js), read its current documentation first.
- Keep `src/engine` pure and framework-free.
- Every new engine function gets unit tests in the same PR.
- Never route media bytes through a Vercel Function.
- Never use `localStorage` for media or large project data.
- Close every `VideoFrame`, `AudioData` and decoder you open.
- When a decision in this document seems wrong, stop and explain why before deviating.
- At the end of each phase, update the "Status" section below.

## 15. Status

- [x] Phase 0
- [x] Phase 1
- [x] Phase 2
- [x] Phase 3 (owner noted small bugs to revisit after Phase 10)
- [x] Phase 4
- [ ] Phase 5
- [ ] Phase 6
- [ ] Phase 7
- [ ] Phase 8
- [ ] Phase 9
- [ ] Phase 10

## 16. References

- Matte, feature and pricing reference: https://matte.app
- Mediabunny: https://mediabunny.dev and https://github.com/Vanilagy/mediabunny
- WebCodecs API (MDN): https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API
- Vercel Blob client uploads: https://vercel.com/docs/vercel-blob/client-upload
- Vercel 4.5 MB function body limit: https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions
- Remotion license FAQ: https://www.remotion.dev/docs/license/faq
- getDisplayMedia cursor constraint (MDN): https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/cursor
- Captured Mouse Events proposal (W3C): https://screen-share.github.io/captured-mouse-events/
- Transformers.js: https://huggingface.co/docs/transformers.js
- OpenScreen, open-source reference for cursor handling problems: https://github.com/getopenscreen/openscreen
