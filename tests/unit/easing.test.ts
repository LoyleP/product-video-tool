import { describe, expect, it } from "vitest";
import {
  cubicBezier,
  EASING_PRESETS,
  easingFunction,
  easingPresetOf,
  springEasing,
  springResponse,
  springSettleTime,
} from "@/engine/easing";

describe("cubicBezier", () => {
  it("is linear for (0,0,1,1)", () => {
    const f = cubicBezier(0, 0, 1, 1);
    for (const p of [0, 0.1, 0.25, 0.5, 0.9, 1]) expect(f(p)).toBeCloseTo(p, 5);
  });

  it("matches known CSS ease values", () => {
    const ease = cubicBezier(0.25, 0.1, 0.25, 1);
    expect(ease(0.5)).toBeCloseTo(0.8024, 3);
    const easeInOut = cubicBezier(0.42, 0, 0.58, 1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 5);
    expect(easeInOut(0.25)).toBeCloseTo(0.1291, 3);
  });

  it("clamps outside 0..1 and is monotonic for standard curves", () => {
    const f = cubicBezier(0.65, 0, 0.35, 1);
    expect(f(-1)).toBe(0);
    expect(f(2)).toBe(1);
    let last = 0;
    for (let p = 0; p <= 1; p += 0.01) {
      expect(f(p)).toBeGreaterThanOrEqual(last - 1e-9);
      last = f(p);
    }
  });
});

describe("springs", () => {
  it("start at 0 and settle at 1", () => {
    for (const [k, c, m] of [
      [100, 20, 1],
      [170, 10, 1],
      [100, 40, 1],
    ] as const) {
      expect(springResponse(k, c, m, 0)).toBeCloseTo(0, 9);
      expect(springResponse(k, c, m, 10)).toBeCloseTo(1, 6);
    }
  });

  it("critically damped does not overshoot; underdamped does", () => {
    const critical = springEasing(100, 20, 1);
    const bouncy = springEasing(170, 8, 1);
    let maxCritical = 0;
    let maxBouncy = 0;
    for (let p = 0; p <= 1; p += 0.005) {
      maxCritical = Math.max(maxCritical, critical(p));
      maxBouncy = Math.max(maxBouncy, bouncy(p));
    }
    expect(maxCritical).toBeLessThanOrEqual(1);
    expect(maxBouncy).toBeGreaterThan(1.05);
  });

  it("stretches to exactly 0 and 1 at the ends", () => {
    const f = springEasing(100, 20, 1);
    expect(f(0)).toBe(0);
    expect(f(1)).toBe(1);
    expect(f(0.999)).toBeGreaterThan(0.99);
    expect(springSettleTime(100, 20, 1)).toBeGreaterThan(0.5);
  });
});

describe("presets", () => {
  it("resolves every preset and recognizes it back", () => {
    for (const [name, preset] of Object.entries(EASING_PRESETS)) {
      const f = easingFunction(preset);
      expect(f(0)).toBe(0);
      expect(f(1)).toBe(1);
      expect(easingPresetOf(preset)).toBe(name);
    }
    expect(easingPresetOf({ type: "cubic-bezier", p: [0.1, 0.2, 0.3, 0.4] })).toBeNull();
  });
});
