import { describe, expect, it } from "vitest";
import { exportSize, videoBitrate } from "@/engine/export/settings";

describe("exportSize", () => {
  const landscape = { width: 1920, height: 1080 };

  it("maps presets for a 16:9 canvas", () => {
    expect(exportSize("1080p", landscape)).toEqual({ width: 1920, height: 1080 });
    expect(exportSize("1440p", landscape)).toEqual({ width: 2560, height: 1440 });
    expect(exportSize("4k", landscape)).toEqual({ width: 3840, height: 2160 });
  });

  it("uses the shorter side for portrait canvases", () => {
    expect(exportSize("1080p", { width: 1080, height: 1920 })).toEqual({ width: 1080, height: 1920 });
  });

  it("rounds to even dimensions", () => {
    const size = exportSize("1080p", { width: 1000, height: 999 });
    expect(size.width % 2).toBe(0);
    expect(size.height % 2).toBe(0);
    expect(exportSize("custom", landscape, { width: 1001, height: 563 })).toEqual({ width: 1002, height: 564 });
  });
});

describe("videoBitrate", () => {
  it("scales with pixels, fps and quality", () => {
    const hd = videoBitrate({ width: 1920, height: 1080 }, 30, "high");
    expect(hd).toBeGreaterThan(5_000_000);
    expect(hd).toBeLessThan(8_000_000);
    expect(videoBitrate({ width: 3840, height: 2160 }, 30, "high")).toBe(hd * 4);
    expect(videoBitrate({ width: 1920, height: 1080 }, 60, "high")).toBe(hd * 2);
    expect(videoBitrate({ width: 1920, height: 1080 }, 30, "standard")).toBeLessThan(hd);
  });
});
