import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { exportSize } from "@/engine/export/settings";
import type { Micros } from "@/engine/time";
import type { Background, CompositionStyle, ExportSettings, Project } from "@/schema/project";

/** Shortest clip a trim can produce. */
export const MIN_CLIP_DURATION: Micros = 100_000;

interface ProjectState {
  project: Project | null;
  setProject: (project: Project | null) => void;
  updateStyle: (recipe: (style: CompositionStyle) => void) => void;
  setBackground: (background: Background) => void;
  setClipTrim: (clipId: string, sourceIn: Micros, sourceOut: Micros) => void;
  setExportPreset: (preset: Exclude<ExportSettings["preset"], "custom">) => void;
  setExportFps: (fps: ExportSettings["fps"]) => void;
}

// Phase 3 routes these mutations through undoable commands.
export const useProjectStore = create<ProjectState>()(
  immer((set) => {
    const edit = (recipe: (project: Project) => void) =>
      set((state) => {
        if (!state.project) return;
        recipe(state.project);
        state.project.updatedAt = new Date().toISOString();
      });

    return {
      project: null,
      setProject: (project) => set({ project }),
      updateStyle: (recipe) => edit((p) => recipe(p.style)),
      setBackground: (background) =>
        edit((p) => {
          p.style.background = background;
        }),
      setClipTrim: (clipId, sourceIn, sourceOut) =>
        edit((p) => {
          for (const track of p.videoTracks) {
            const clip = track.clips.find((c) => c.id === clipId);
            if (!clip) continue;
            const duration = p.assets[clip.assetId]?.duration ?? sourceOut;
            const start = Math.round(Math.min(Math.max(0, sourceIn), duration - MIN_CLIP_DURATION));
            clip.sourceIn = Math.max(0, start);
            clip.sourceOut = Math.round(Math.min(duration, Math.max(sourceOut, clip.sourceIn + MIN_CLIP_DURATION)));
          }
        }),
      setExportPreset: (preset) =>
        edit((p) => {
          const size = exportSize(preset, p.canvas);
          p.export.preset = preset;
          p.export.width = size.width;
          p.export.height = size.height;
        }),
      setExportFps: (fps) =>
        edit((p) => {
          p.export.fps = fps;
        }),
    };
  }),
);
