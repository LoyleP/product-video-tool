import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Background, CompositionStyle, Project } from "@/schema/project";

interface ProjectState {
  project: Project | null;
  setProject: (project: Project | null) => void;
  updateStyle: (recipe: (style: CompositionStyle) => void) => void;
  setBackground: (background: Background) => void;
}

// Phase 3 routes these mutations through undoable commands.
export const useProjectStore = create<ProjectState>()(
  immer((set) => ({
    project: null,
    setProject: (project) => set({ project }),
    updateStyle: (recipe) =>
      set((state) => {
        if (!state.project) return;
        recipe(state.project.style);
        state.project.updatedAt = new Date().toISOString();
      }),
    setBackground: (background) =>
      set((state) => {
        if (!state.project) return;
        state.project.style.background = background;
        state.project.updatedAt = new Date().toISOString();
      }),
  })),
);
