import { describe, expect, it } from "vitest";
import type { DrawableFrame, FrameProvider, RenderContext } from "@/engine/frame-provider";
import { renderFrame } from "@/engine/render-frame";
import { createProjectFromVideo } from "@/schema/defaults";
import type { Project } from "@/schema/project";

type Call = [string, ...unknown[]];

/** Records the canvas calls renderFrame makes, enough to check composition without a real canvas. */
function recordingContext() {
  const calls: Call[] = [];
  const ctx = new Proxy(
    {},
    {
      get(_, prop: string) {
        if (prop === "createLinearGradient") {
          return (...args: unknown[]) => {
            calls.push(["createLinearGradient", ...args]);
            return { addColorStop: (...a: unknown[]) => calls.push(["addColorStop", ...a]) };
          };
        }
        return (...args: unknown[]) => calls.push([prop, ...args]);
      },
      set(_, prop: string, value) {
        calls.push([`set:${prop}`, value]);
        return true;
      },
    },
  );
  return { ctx: ctx as RenderContext, calls };
}

function project(): Project {
  let n = 0;
  return createProjectFromVideo({
    id: "p",
    now: "2026-01-01T00:00:00.000Z",
    sourceFps: 60,
    newId: () => `id-${++n}`,
    asset: {
      id: "asset",
      kind: "video",
      name: "clip.mp4",
      storage: { type: "opfs", path: "assets/asset.mp4" },
      width: 1920,
      height: 1080,
      duration: 5_000_000,
      hasAudio: false,
      codec: "avc",
      isVariableFrameRate: false,
    },
  });
}

function provider(frame: DrawableFrame | null) {
  const requests: [string, number][] = [];
  const frames: FrameProvider = {
    getFrame(assetId, t) {
      requests.push([assetId, t]);
      return frame;
    },
  };
  return { frames, requests };
}

describe("renderFrame", () => {
  it("clears, paints the background and draws the frame in the padded rect", () => {
    const drawn: number[][] = [];
    const frame: DrawableFrame = { width: 1920, height: 1080, draw: (_c, ...r) => drawn.push(r) };
    const { ctx, calls } = recordingContext();
    const { frames, requests } = provider(frame);
    const p = project();
    p.style.padding = 0.1;

    renderFrame({ ctx, width: 1920, height: 1080 }, p, 1_000_000, frames);

    const names = calls.map((c) => c[0]);
    expect(names.indexOf("clearRect")).toBeLessThan(names.indexOf("fillRect"));
    expect(names).toContain("createLinearGradient");
    expect(requests).toEqual([["asset", 1_000_000]]);
    expect(drawn).toHaveLength(1);
    const [x, y, w, h] = drawn[0]!;
    expect(x).toBeCloseTo(192);
    expect(y).toBeCloseTo(108);
    expect(w).toBeCloseTo(1536);
    expect(h).toBeCloseTo(864);
  });

  it("scales canvas units to the output size, including shadows", () => {
    const { ctx, calls } = recordingContext();
    const p = project();
    renderFrame({ ctx, width: 3840, height: 2160 }, p, 0, provider(null).frames);
    expect(calls).toContainEqual(["setTransform", 2, 0, 0, 2, 0, 0]);
    expect(calls).toContainEqual(["set:shadowBlur", p.style.shadow.blur * 2]);
    expect(calls).toContainEqual(["set:shadowOffsetY", p.style.shadow.offsetY * 2]);
  });

  it("draws nothing for the media outside any clip", () => {
    const { ctx } = recordingContext();
    const { frames, requests } = provider(null);
    renderFrame({ ctx, width: 1920, height: 1080 }, project(), 10_000_000, frames);
    expect(requests).toHaveLength(0);
  });

  it("skips hidden tracks", () => {
    const { ctx } = recordingContext();
    const { frames, requests } = provider(null);
    const p = project();
    p.videoTracks[0]!.hidden = true;
    renderFrame({ ctx, width: 1920, height: 1080 }, p, 0, frames);
    expect(requests).toHaveLength(0);
  });

  it("is deterministic for the same inputs", () => {
    const a = recordingContext();
    const b = recordingContext();
    const frame: DrawableFrame = { width: 1920, height: 1080, draw: () => {} };
    renderFrame({ ctx: a.ctx, width: 1920, height: 1080 }, project(), 2_000_000, provider(frame).frames);
    renderFrame({ ctx: b.ctx, width: 1920, height: 1080 }, project(), 2_000_000, provider(frame).frames);
    expect(JSON.stringify(a.calls)).toBe(JSON.stringify(b.calls));
  });
});

describe("renderFrame with zoom", () => {
  const zoomed = () => {
    const p = project();
    p.zooms = [
      {
        id: "z",
        start: 0,
        end: 3_000_000,
        scale: 2,
        focus: { x: 0.5, y: 0.5 },
        easeIn: { type: "cubic-bezier", p: [0, 0, 1, 1] },
        easeOut: { type: "cubic-bezier", p: [0, 0, 1, 1] },
        origin: "manual",
      },
    ];
    return p;
  };

  it("applies the camera transform after the background", () => {
    const { ctx, calls } = recordingContext();
    renderFrame({ ctx, width: 1920, height: 1080 }, zoomed(), 1_000_000, provider(null).frames);
    const names = calls.map((c) => c[0]);
    const transform = calls.find((c) => c[0] === "transform")!;
    expect(transform[1]).toBe(2);
    expect(names.indexOf("fillRect")).toBeLessThan(names.indexOf("transform"));
    // Shadows scale with zoom because canvas shadows ignore transforms.
    expect(calls).toContainEqual(["set:shadowBlur", zoomed().style.shadow.blur * 2]);
  });

  it("blurs the background in proportion to zoom progress", () => {
    const p = zoomed();
    p.style.zoomBackgroundBlur = 20;
    const half = recordingContext();
    renderFrame({ ctx: half.ctx, width: 1920, height: 1080 }, p, 300_000, provider(null).frames);
    expect(half.calls).toContainEqual(["set:filter", "blur(10px)"]);
    const full = recordingContext();
    renderFrame({ ctx: full.ctx, width: 960, height: 540 }, p, 1_000_000, provider(null).frames);
    expect(full.calls).toContainEqual(["set:filter", "blur(10px)"]); // 20 canvas units at half scale
  });

  it("does not blur at rest", () => {
    const p = zoomed();
    p.style.zoomBackgroundBlur = 20;
    const { ctx, calls } = recordingContext();
    renderFrame({ ctx, width: 1920, height: 1080 }, p, 4_000_000, provider(null).frames);
    expect(calls.some((c) => c[0] === "set:filter")).toBe(false);
  });
});
