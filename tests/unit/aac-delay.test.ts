import { describe, expect, it } from "vitest";
import { detectDelay } from "@/engine/export/aac-encoder";

function burst(length: number, at: number, preEcho = 0) {
  const signal = new Float32Array(length);
  for (let i = at - 200; i < at; i++) if (i >= 0) signal[i] = preEcho;
  for (let i = at; i < at + 500; i++) signal[i] = 0.8 * Math.sin((2 * Math.PI * (i - at)) / 48 + Math.PI / 2);
  return signal;
}

describe("detectDelay", () => {
  it("finds how far a burst moved", () => {
    expect(detectDelay(burst(10_000, 4800 + 2112), 4800)).toBe(2112);
    expect(detectDelay(burst(10_000, 4800), 4800)).toBe(0);
  });

  it("ignores low-level pre-echo before the transient", () => {
    expect(detectDelay(burst(10_000, 5824, 0.1), 4800)).toBe(1024);
  });

  it("returns zero for silence and never goes negative", () => {
    expect(detectDelay(new Float32Array(100), 10)).toBe(0);
    expect(detectDelay(burst(10_000, 100), 4800)).toBe(0);
  });
});
