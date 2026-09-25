import { beforeEach, describe, expect, it } from "vitest";
import { createProjectFromVideo } from "@/schema/defaults";
import type { MediaAsset } from "@/schema/project";
import { setClipSource } from "@/store/edits";
import { useProjectStore } from "@/store/project-store";

const asset: MediaAsset = {
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
};

function load() {
  let n = 0;
  const project = createProjectFromVideo({
    id: "p",
    now: "2026-01-01T00:00:00.000Z",
    sourceFps: 30,
    newId: () => `id-${++n}`,
    asset,
  });
  useProjectStore.getState().setProject(project);
  return project;
}

const state = () => useProjectStore.getState();
const clipId = () => state().project!.videoTracks[0]!.clips[0]!.id;

describe("undo and redo", () => {
  beforeEach(() => state().setProject(null));

  it("restores any edit exactly", () => {
    const original = load();
    state().updateStyle((s) => void (s.padding = 0.2));
    state().setBackground({ type: "solid", color: "#ff0000" });
    state().commit((p) => setClipSource(p, clipId(), 1_000_000, 4_000_000));
    const edited = state().project;

    state().undo();
    state().undo();
    state().undo();
    expect(state().project).toEqual(original);
    expect(state().project).toBe(original);

    state().redo();
    state().redo();
    state().redo();
    expect(state().project).toBe(edited);
  });

  it("does not record rejected or no-op edits", () => {
    load();
    expect(state().commit(() => false)).toBe(false);
    expect(state().commit(() => {})).toBe(false);
    expect(state().past).toHaveLength(0);
  });

  it("clears redo after a new edit", () => {
    load();
    state().updateStyle((s) => void (s.padding = 0.2));
    state().undo();
    state().updateStyle((s) => void (s.cornerRadius = 10));
    expect(state().future).toHaveLength(0);
    state().redo();
    expect(state().project!.style.padding).not.toBe(0.2);
  });

  it("coalesces a drag into one undo step", () => {
    const original = load();
    for (let i = 1; i <= 10; i++) state().updateStyle((s) => void (s.padding = i / 100), { coalesce: "padding" });
    expect(state().past).toHaveLength(1);
    expect(state().project!.style.padding).toBe(0.1);
    state().undo();
    expect(state().project).toBe(original);
  });

  it("does not coalesce different keys", () => {
    load();
    state().updateStyle((s) => void (s.padding = 0.2), { coalesce: "padding" });
    state().updateStyle((s) => void (s.cornerRadius = 4), { coalesce: "radius" });
    expect(state().past).toHaveLength(2);
  });

  it("resets history when a project is opened", () => {
    load();
    state().updateStyle((s) => void (s.padding = 0.2));
    load();
    expect(state().past).toHaveLength(0);
    state().undo();
    expect(state().project!.style.padding).toBe(0.08);
  });

  it("keeps export size in sync with the preset", () => {
    load();
    state().setExportPreset("4k");
    expect(state().project!.export).toMatchObject({ preset: "4k", width: 3840, height: 2160 });
  });
});
