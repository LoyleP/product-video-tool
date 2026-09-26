import { probeVideo } from "@/engine/decode/probe";
import type { RecordingResult } from "@/engine/record/recorder";
import { createProjectFromVideo } from "@/schema/defaults";
import type { MediaAsset, Project } from "@/schema/project";
import { rememberAssetFile } from "@/storage/asset-files";
import { readAssetFile } from "@/storage/opfs";
import { saveProject } from "@/storage/projects";

/**
 * Turns a finished recording in OPFS into a project, with no re-import (BUILD.md Phase 5): the screen is
 * the main clip and the webcam, when present, becomes a circular overlay track in the bottom-right corner.
 */
export async function projectFromRecording(path: string, result: RecordingResult, name: string): Promise<Project> {
  const file = await readAssetFile(path);
  const screen = await probeVideo(file, 0);
  const screenAsset: MediaAsset = {
    id: crypto.randomUUID(),
    kind: "video",
    name,
    storage: { type: "opfs", path },
    width: screen.width,
    height: screen.height,
    duration: screen.duration,
    hasAudio: screen.hasAudio,
    codec: screen.codec,
    isVariableFrameRate: screen.isVariableFrameRate,
    videoTrack: 0,
    capture: result.capture,
  };
  const project = createProjectFromVideo({
    id: crypto.randomUUID(),
    now: new Date().toISOString(),
    asset: screenAsset,
    sourceFps: screen.averageFps,
    newId: () => crypto.randomUUID(),
  });
  rememberAssetFile(screenAsset.id, file);

  if (result.hasWebcam) {
    const cam = await probeVideo(file, 1);
    const camAsset: MediaAsset = {
      id: crypto.randomUUID(),
      kind: "video",
      name: `${name} (camera)`,
      storage: { type: "opfs", path },
      width: cam.width,
      height: cam.height,
      duration: cam.duration,
      hasAudio: false,
      codec: cam.codec,
      isVariableFrameRate: cam.isVariableFrameRate,
      videoTrack: 1,
    };
    project.assets[camAsset.id] = camAsset;
    project.videoTracks.push({
      id: crypto.randomUUID(),
      hidden: false,
      overlay: { shape: "circle", size: 0.26, corner: "bottom-right", mirror: true },
      clips: [
        {
          id: crypto.randomUUID(),
          assetId: camAsset.id,
          timelineStart: 0,
          sourceIn: 0,
          sourceOut: Math.min(cam.duration, screen.duration),
          speed: 1,
          muted: true,
        },
      ],
    });
    rememberAssetFile(camAsset.id, file);
  }

  await saveProject(project);
  return project;
}
