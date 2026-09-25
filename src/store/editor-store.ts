import { create } from "zustand";

export type Selection = { kind: "clip"; id: string } | { kind: "zoom"; id: string } | null;

/** UI state that is not part of the project and not undoable. */
interface EditorState {
  selection: Selection;
  select: (selection: Selection) => void;
  /** Timeline horizontal zoom. */
  pxPerSecond: number;
  setPxPerSecond: (value: number) => void;
}

export const MIN_PX_PER_SECOND = 10;
export const MAX_PX_PER_SECOND = 800;

export const useEditorStore = create<EditorState>()((set) => ({
  selection: null,
  select: (selection) => set({ selection }),
  pxPerSecond: 80,
  setPxPerSecond: (value) =>
    set({ pxPerSecond: Math.min(MAX_PX_PER_SECOND, Math.max(MIN_PX_PER_SECOND, value)) }),
}));
