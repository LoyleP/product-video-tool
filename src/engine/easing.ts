import type { Easing } from "@/schema/project";

/** Maps progress 0..1 to eased progress (0 at 0, 1 at 1; springs may overshoot in between). */
export type EasingFn = (p: number) => number;

/** CSS-style cubic-bezier(x1, y1, x2, y2). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): EasingFn {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sampleY = (u: number) => ((ay * u + by) * u + cy) * u;
  const slopeX = (u: number) => (3 * ax * u + 2 * bx) * u + cx;

  const solveU = (x: number) => {
    // Newton's method, then bisection if the slope is too flat.
    let u = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(u) - x;
      if (Math.abs(err) < 1e-7) return u;
      const d = slopeX(u);
      if (Math.abs(d) < 1e-6) break;
      u -= err / d;
    }
    let lo = 0;
    let hi = 1;
    u = x;
    while (hi - lo > 1e-7) {
      if (sampleX(u) < x) lo = u;
      else hi = u;
      u = (lo + hi) / 2;
    }
    return u;
  };

  return (p) => (p <= 0 ? 0 : p >= 1 ? 1 : sampleY(solveU(p)));
}

/** Step response of a damped spring from 0 to 1 at time t (seconds). */
export function springResponse(stiffness: number, damping: number, mass: number, t: number): number {
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  if (Math.abs(zeta - 1) < 1e-6) return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  }
  const root = Math.sqrt(zeta * zeta - 1);
  const r1 = -w0 * (zeta - root);
  const r2 = -w0 * (zeta + root);
  return 1 + (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r1 - r2);
}

/** Time for the spring to stay within 0.1% of its target, searched in 1 ms steps up to 10 s. */
export function springSettleTime(stiffness: number, damping: number, mass: number): number {
  let lastOutside = 0;
  for (let ms = 0; ms <= 10_000; ms++) {
    const t = ms / 1000;
    if (Math.abs(springResponse(stiffness, damping, mass, t) - 1) >= 1e-3) lastOutside = t;
  }
  return Math.max(lastOutside + 0.001, 0.001);
}

/** A spring stretched to fit progress 0..1 over its settle time. */
export function springEasing(stiffness: number, damping: number, mass: number): EasingFn {
  const settle = springSettleTime(stiffness, damping, mass);
  return (p) => (p <= 0 ? 0 : p >= 1 ? 1 : springResponse(stiffness, damping, mass, p * settle));
}

const cache = new Map<string, EasingFn>();

export function easingFunction(easing: Easing): EasingFn {
  const key = JSON.stringify(easing);
  let fn = cache.get(key);
  if (!fn) {
    fn =
      easing.type === "cubic-bezier"
        ? cubicBezier(...easing.p)
        : springEasing(easing.stiffness, easing.damping, easing.mass);
    cache.set(key, fn);
  }
  return fn;
}

export const EASING_PRESETS = {
  /** Critically damped: no overshoot (BUILD.md 7.3 default). */
  spring: { type: "spring", stiffness: 100, damping: 20, mass: 1 },
  smooth: { type: "cubic-bezier", p: [0.65, 0, 0.35, 1] },
  snappy: { type: "cubic-bezier", p: [0.2, 0.9, 0.1, 1] },
  linear: { type: "cubic-bezier", p: [0, 0, 1, 1] },
} as const satisfies Record<string, Easing>;

export type EasingPreset = keyof typeof EASING_PRESETS;

/** The preset an easing matches, if any. */
export function easingPresetOf(easing: Easing): EasingPreset | null {
  const key = JSON.stringify(easing);
  for (const [name, preset] of Object.entries(EASING_PRESETS)) {
    if (JSON.stringify(preset) === key) return name as EasingPreset;
  }
  return null;
}

/**
 * Zoom motion in plain words: easing plus transition length. "Gentle" is the default critically damped
 * spring at 600 ms (BUILD.md 7.3).
 */
export const MOTION_PRESETS = {
  gentle: { easing: EASING_PRESETS.spring, transition: 600_000 },
  quick: { easing: EASING_PRESETS.snappy, transition: 350_000 },
  slow: { easing: EASING_PRESETS.smooth, transition: 1_000_000 },
} as const;

export type MotionPreset = keyof typeof MOTION_PRESETS;

/** The motion preset a zoom uses, or null for a custom combination. */
export function motionPresetOf(zoom: { easeIn: Easing; transition?: number }): MotionPreset | null {
  const easing = JSON.stringify(zoom.easeIn);
  const transition = zoom.transition ?? 600_000;
  for (const [name, preset] of Object.entries(MOTION_PRESETS)) {
    if (JSON.stringify(preset.easing) === easing && preset.transition === transition) return name as MotionPreset;
  }
  return null;
}
