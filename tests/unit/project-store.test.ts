import { beforeEach, describe, expect, it } from "vitest";
import { createProjectFromVideo } from "@/schema/defaults";
import { MIN_CLIP_DURATION, useProjectStore } from "@/store/project-store";

function load() {
  let n = 0;
  const project = createProjectFromVideo({
    id: "p",
    now: "2026-01-01T00:00:00.000Z",
    sourceFps: 30,
    newId: () => `id-${++n}`,
    asset: {
      id: "a",
      kind: "video",
      name: "clip.mp4",
      storage: { type: "opfs", path: "assets/a.mp4" },
      width: 1920,
      height: 1080,
      duration: 10_000_000,
      hasAudio: true,
      codec: "avc",
      isVariableFrameRate: false,
    },
  });
  useProjectStore.getState().setProject(project);
  return project.videoTracks[0]!.clips[0]!.id;
}

const clip = () => useProjectStore.getState().project!.videoTracks[0]!.clips[0]!;

describe("project store", () => {
  beforeEach(() => useProjectStore.getState().setProject(null));

  it("trims a clip in source time", () => {
    const id = load();
    useProjectStore.getState().setClipTrim(id, 1_000_000, 4_000_000);
    expect(clip()).toMatchObject({ sourceIn: 1_000_000, sourceOut: 4_000_000 });
  });

  it("clamps trims to the asset and a minimum length", () => {
    const id = load();
    useProjectStore.getState().setClipTrim(id, -5, 99_000_000);
    expect(clip()).toMatchObject({ sourceIn: 0, sourceOut: 10_000_000 });
    useProjectStore.getState().setClipTrim(id, 5_000_000, 5_000_000);
    expect(clip().sourceOut - clip().sourceIn).toBe(MIN_CLIP_DURATION);
    useProjectStore.getState().setClipTrim(id, 10_000_000, 10_000_000);
    expect(clip().sourceOut).toBe(10_000_000);
    expect(clip().sourceIn).toBe(10_000_000 - MIN_CLIP_DURATION);
  });

  it("keeps trims integer", () => {
    const id = load();
    useProjectStore.getState().setClipTrim(id, 1_000_000.4, 2_000_000.6);
    expect(Number.isInteger(clip().sourceIn)).toBe(true);
    expect(Number.isInteger(clip().sourceOut)).toBe(true);
  });

  it("keeps export size in sync with the preset", () => {
    load();
    useProjectStore.getState().setExportPreset("4k");
    expect(useProjectStore.getState().project!.export).toMatchObject({ preset: "4k", width: 3840, height: 2160 });
  });
});
