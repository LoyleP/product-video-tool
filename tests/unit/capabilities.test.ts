import { describe, expect, it } from "vitest";
import { detectCapabilities, isEditorSupported, type CapabilityEnv } from "@/lib/capabilities";

const fn = () => {};

const desktopChrome: CapabilityEnv = {
  VideoDecoder: fn,
  VideoEncoder: fn,
  AudioDecoder: fn,
  AudioEncoder: fn,
  OffscreenCanvas: fn,
  Worker: fn,
  indexedDB: {},
  ClipboardItem: fn,
  navigator: {
    mediaDevices: { getDisplayMedia: fn, getUserMedia: fn },
    storage: { getDirectory: fn, estimate: fn },
    gpu: {},
  },
  matchMedia: (query) => ({ matches: query === "(any-pointer: fine)" }),
};

describe("detectCapabilities", () => {
  it("reports every capability on a full-featured desktop browser", () => {
    const caps = detectCapabilities(desktopChrome);
    expect(Object.values(caps).every(Boolean)).toBe(true);
    expect(isEditorSupported(caps)).toBe(true);
  });

  it("reports nothing on an empty environment", () => {
    const caps = detectCapabilities({});
    expect(Object.values(caps).some(Boolean)).toBe(false);
    expect(isEditorSupported(caps)).toBe(false);
  });

  it("detects missing encoders independently of decoders", () => {
    const caps = detectCapabilities({ ...desktopChrome, VideoEncoder: undefined, AudioEncoder: undefined });
    expect(caps.videoDecoder).toBe(true);
    expect(caps.videoEncoder).toBe(false);
    expect(caps.audioEncoder).toBe(false);
  });

  it("treats touch-only devices as unsupported for the editor", () => {
    const caps = detectCapabilities({ ...desktopChrome, matchMedia: () => ({ matches: false }) });
    expect(caps.finePointer).toBe(false);
    expect(isEditorSupported(caps)).toBe(false);
  });

  it("detects a missing getDisplayMedia (mobile Safari)", () => {
    const caps = detectCapabilities({
      ...desktopChrome,
      navigator: { ...desktopChrome.navigator, mediaDevices: { getUserMedia: fn } },
    });
    expect(caps.getDisplayMedia).toBe(false);
    expect(caps.getUserMedia).toBe(true);
  });
});
