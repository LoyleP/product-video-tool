import { describe, expect, it } from "vitest";
import { formatTime } from "@/lib/format-time";

describe("formatTime", () => {
  it("formats minutes, seconds and hundredths", () => {
    expect(formatTime(0)).toBe("0:00.00");
    expect(formatTime(3_210_000)).toBe("0:03.21");
    expect(formatTime(61_999_999)).toBe("1:01.99");
  });

  it("adds hours past an hour and clamps negatives", () => {
    expect(formatTime(3_725_500_000)).toBe("1:02:05.50");
    expect(formatTime(-5)).toBe("0:00.00");
  });
});
