import { create } from "zustand";

export type SelectionKind = "clip" | "zoom" | "text" | "gesture" | "suggestion" | "effect";
export type Selection = { kind: SelectionKind; id: string } | null;

/** UI state that is not part of the project and not undoable. */
interface EditorState {
  selection: Selection;
  select: (selection: Selection) => void;
  /** Timeline horizontal zoom. */
  pxPerSecond: number;
  setPxPerSecond: (value: number) => void;
  /** When on, clicking the preview adds a tap and dragging adds a swipe at the playhead. */
  gestureTool: boolean;
  setGestureTool: (on: boolean) => void;
}

export const MIN_PX_PER_SECOND = 10;
export const MAX_PX_PER_SECOND = 800;

export const useEditorStore = create<EditorState>()((set) => ({
  selection: null,
  select: (selection) => set({ selection }),
  pxPerSecond: 80,
  setPxPerSecond: (value) =>
    set({ pxPerSecond: Math.min(MAX_PX_PER_SECOND, Math.max(MIN_PX_PER_SECOND, value)) }),
  gestureTool: false,
  setGestureTool: (gestureTool) => set({ gestureTool }),
}));
