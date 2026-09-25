import { produce, type Draft } from "immer";
import { create } from "zustand";
import { exportSize } from "@/engine/export/settings";
import type { Background, CompositionStyle, ExportSettings, Project } from "@/schema/project";

/** Commits with the same coalesce key within this window merge into one undo step (drags, sliders). */
const COALESCE_WINDOW_MS = 1000;
const HISTORY_LIMIT = 200;

export interface CommitOptions {
  /** Merge with the previous commit when it had the same key and happened within a second. */
  coalesce?: string;
}

interface ProjectState {
  project: Project | null;
  past: Project[];
  future: Project[];
  lastCommit: { key: string; at: number } | null;

  /** Replaces the project (open, import) and clears undo history. */
  setProject: (project: Project | null) => void;
  /**
   * The single way to change the project (BUILD.md section 8). The recipe mutates a draft and may return
   * false to reject the edit. Each accepted commit is one undo step unless coalesced.
   */
  commit: (recipe: (draft: Draft<Project>) => boolean | void, options?: CommitOptions) => boolean;
  undo: () => void;
  redo: () => void;

  updateStyle: (recipe: (style: Draft<CompositionStyle>) => void, options?: CommitOptions) => void;
  setBackground: (background: Background) => void;
  setExportPreset: (preset: Exclude<ExportSettings["preset"], "custom">) => void;
  setExportFps: (fps: ExportSettings["fps"]) => void;
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  project: null,
  past: [],
  future: [],
  lastCommit: null,

  setProject: (project) => set({ project, past: [], future: [], lastCommit: null }),

  commit: (recipe, options = {}) => {
    const { project, past, lastCommit } = get();
    if (!project) return false;
    let accepted = true;
    const next = produce(project, (draft) => {
      if (recipe(draft) === false) accepted = false;
    });
    if (!accepted || next === project) return false;
    const stamped = produce(next, (draft) => {
      draft.updatedAt = new Date().toISOString();
    });

    const now = Date.now();
    const merge =
      options.coalesce !== undefined &&
      lastCommit?.key === options.coalesce &&
      now - lastCommit.at < COALESCE_WINDOW_MS &&
      past.length > 0;
    set({
      project: stamped,
      past: merge ? past : [...past, project].slice(-HISTORY_LIMIT),
      future: [],
      lastCommit: options.coalesce !== undefined ? { key: options.coalesce, at: now } : null,
    });
    return true;
  },

  undo: () => {
    const { project, past, future } = get();
    const previous = past[past.length - 1];
    if (!project || !previous) return;
    set({ project: previous, past: past.slice(0, -1), future: [project, ...future], lastCommit: null });
  },

  redo: () => {
    const { project, past, future } = get();
    const next = future[0];
    if (!project || !next) return;
    set({ project: next, past: [...past, project], future: future.slice(1), lastCommit: null });
  },

  updateStyle: (recipe, options) => {
    get().commit((p) => recipe(p.style), options);
  },
  setBackground: (background) => {
    get().commit((p) => {
      p.style.background = background;
    });
  },
  setExportPreset: (preset) => {
    get().commit((p) => {
      const size = exportSize(preset, p.canvas);
      p.export.preset = preset;
      p.export.width = size.width;
      p.export.height = size.height;
    });
  },
  setExportFps: (fps) => {
    get().commit((p) => {
      p.export.fps = fps;
    });
  },
}));
