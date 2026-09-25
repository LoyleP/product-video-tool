import { describe, expect, it } from "vitest";
import { createProjectFromVideo, DEFAULT_STYLE } from "@/schema/defaults";
import { projectSchema, type MediaAsset } from "@/schema/project";
import { migrateProject, ProjectMigrationError } from "@/storage/migrations";

const asset: MediaAsset = {
  id: "asset-1",
  kind: "video",
  name: "Demo recording.mov",
  storage: { type: "opfs", path: "assets/asset-1.mov" },
  width: 1179,
  height: 2556,
  duration: 60_000_000,
  hasAudio: true,
  codec: "avc",
  isVariableFrameRate: true,
};

function makeProject(sourceFps = 60) {
  let n = 0;
  return createProjectFromVideo({
    id: "project-1",
    now: "2026-01-01T00:00:00.000Z",
    asset,
    sourceFps,
    newId: () => `id-${++n}`,
  });
}

describe("createProjectFromVideo", () => {
  it("builds a valid single-clip project", () => {
    const project = makeProject();
    expect(projectSchema.safeParse(project).success).toBe(true);
    expect(project.name).toBe("Demo recording");
    expect(project.videoTracks).toHaveLength(1);
    expect(project.videoTracks[0]!.clips[0]).toMatchObject({
      assetId: "asset-1",
      timelineStart: 0,
      sourceIn: 0,
      sourceOut: 60_000_000,
      speed: 1,
    });
  });

  it("picks 60 fps for high frame rate sources and 30 otherwise", () => {
    expect(makeProject(59.94).canvas.fps).toBe(60);
    expect(makeProject(29.97).canvas.fps).toBe(30);
    expect(makeProject(12).export.fps).toBe(30);
  });

  it("does not share the default style object", () => {
    const project = makeProject();
    project.style.shadow.blur = 999;
    expect(DEFAULT_STYLE.shadow.blur).not.toBe(999);
  });
});

describe("migrateProject", () => {
  it("accepts a current project", () => {
    const project = makeProject();
    expect(migrateProject(JSON.parse(JSON.stringify(project)))).toEqual(project);
  });

  it("rejects missing or future schema versions", () => {
    expect(() => migrateProject({})).toThrow(ProjectMigrationError);
    expect(() => migrateProject(null)).toThrow(ProjectMigrationError);
    expect(() => migrateProject({ ...makeProject(), schemaVersion: 99 })).toThrow(/newer version/);
  });

  it("rejects float times", () => {
    const project = makeProject();
    project.videoTracks[0]!.clips[0]!.sourceOut = 1.5;
    expect(() => migrateProject(project)).toThrow(ProjectMigrationError);
  });
});
