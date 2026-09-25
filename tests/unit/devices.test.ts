import { describe, expect, it } from "vitest";
import { coverRect, DEVICE_IDS, DEVICES, suggestDevice } from "@/engine/devices";
import type { RenderContext } from "@/engine/frame-provider";
import { layoutAt } from "@/engine/render-frame";
import { createProjectFromVideo } from "@/schema/defaults";
import type { Project } from "@/schema/project";

/** Records roundRect calls between beginPath and fill("evenodd"), which are the screen cutouts. */
function cutouts(draw: (ctx: RenderContext) => void) {
  const holes: number[][] = [];
  let path: number[][] = [];
  const ctx = new Proxy(
    {},
    {
      get(_, prop: string) {
        if (prop === "beginPath") return () => (path = []);
        if (prop === "roundRect") return (...args: number[]) => path.push(args.slice(0, 4));
        if (prop === "fill") return (rule?: string) => rule === "evenodd" && holes.push(path[path.length - 1]!);
        return () => {};
      },
      set: () => true,
    },
  );
  draw(ctx as RenderContext);
  return holes;
}

describe("device frames", () => {
  for (const id of DEVICE_IDS) {
    const def = DEVICES[id];
    for (const aspect of [1179 / 2556, 16 / 10, 1, 4 / 3]) {
      it(`${id} cuts its screen hole exactly at the screen rect (aspect ${aspect.toFixed(2)})`, () => {
        const g = def.geometry(aspect);
        const s = g.screen;
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.x + s.w).toBeLessThanOrEqual(g.width);
        expect(s.y + s.h).toBeLessThanOrEqual(g.height);
        const holes = cutouts((ctx) => def.draw(ctx, g, def.colors[0]!));
        expect(holes.length).toBeGreaterThan(0);
        for (const hole of holes) expect(hole).toEqual([s.x, s.y, s.w, s.h]);
      });
    }
  }

  it("browser windows adapt to the recording's aspect ratio", () => {
    for (const aspect of [0.5, 1, 16 / 9, 2.4]) {
      const { screen } = DEVICES.browser.geometry(aspect);
      expect(screen.w / screen.h).toBeCloseTo(aspect, 2);
    }
  });

  it("tablets rotate for landscape recordings", () => {
    expect(DEVICES.tablet.geometry(0.7).screen.h).toBeGreaterThan(DEVICES.tablet.geometry(0.7).screen.w);
    expect(DEVICES.tablet.geometry(1.4).screen.w).toBeGreaterThan(DEVICES.tablet.geometry(1.4).screen.h);
  });

  it("suggests a frame from the aspect ratio", () => {
    expect(suggestDevice(1179 / 2556)).toBe("phone");
    expect(suggestDevice(1640 / 2360)).toBe("tablet");
    expect(suggestDevice(2560 / 1600)).toBe("laptop");
    expect(suggestDevice(1920 / 1080)).toBe("browser");
    expect(suggestDevice(1)).toBe("browser");
  });

  it("covers a screen with media of another aspect, centered", () => {
    const r = coverRect({ x: 0, y: 0, w: 100, h: 200 }, 1);
    expect(r).toEqual({ x: -50, y: 0, w: 200, h: 200 });
  });
});

describe("layout with a device", () => {
  function project(width: number, height: number, frameId: string): Project {
    let n = 0;
    const p = createProjectFromVideo({
      id: "p",
      now: "2026-01-01T00:00:00.000Z",
      sourceFps: 30,
      newId: () => `id-${++n}`,
      asset: {
        id: "a",
        kind: "video",
        name: "a.mp4",
        storage: { type: "opfs", path: "assets/a.mp4" },
        width,
        height,
        duration: 5_000_000,
        hasAudio: false,
        codec: "avc",
        isVariableFrameRate: false,
      },
    });
    p.style.device = { frameId, color: "graphite" };
    return p;
  }

  it("fills the phone screen exactly with a phone recording", () => {
    const layout = layoutAt(project(1179, 2556, "phone"), 0);
    const m = layout.media[0]!;
    expect(m.draw.x).toBeCloseTo(m.screen.x, 9);
    expect(m.draw.w).toBeCloseTo(m.screen.w, 9);
    expect(m.draw.h).toBeCloseTo(m.screen.h, 9);
    expect(layout.primaryRect).toEqual(m.screen);
    // The device sits inside the padded area.
    expect(m.device!.rect.y).toBeCloseTo(0.08 * 1080);
  });

  it("crops media of another aspect to fill the screen", () => {
    const m = layoutAt(project(1920, 1080, "phone"), 0).media[0]!;
    expect(m.draw.h).toBeCloseTo(m.screen.h);
    expect(m.draw.w).toBeGreaterThan(m.screen.w);
  });

  it("falls back to no device for unknown ids", () => {
    const m = layoutAt(project(1920, 1080, "does-not-exist"), 0).media[0]!;
    expect(m.device).toBeNull();
  });
});
