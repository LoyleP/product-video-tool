import { create } from "zustand";
import type { Micros } from "@/engine/time";

/** A suggested zoom on the timeline, shown as a ghost until accepted or dismissed (BUILD.md 7.6 step 6). */
export interface ZoomSuggestion {
  id: string;
  start: Micros;
  end: Micros;
  scale: number;
  focus: { x: number; y: number };
}

/** Shared empty list, so store selectors return a stable value when there are no suggestions. */
export const NO_SUGGESTIONS: readonly ZoomSuggestion[] = [];

export type SuggestionStatus =
  | { kind: "idle" }
  | { kind: "analyzing"; progress: number }
  | { kind: "done"; found: number }
  | { kind: "error"; message: string };

/** Suggestions for the open project. Not saved and not undoable: they are proposals, not edits. */
interface SuggestionsState {
  projectId: string | null;
  suggestions: ZoomSuggestion[];
  status: SuggestionStatus;
  setStatus: (status: SuggestionStatus) => void;
  setSuggestions: (projectId: string, suggestions: ZoomSuggestion[]) => void;
  update: (id: string, patch: Partial<Omit<ZoomSuggestion, "id">>) => void;
  remove: (ids: string[]) => void;
  reset: (projectId: string | null) => void;
}

export const useSuggestionsStore = create<SuggestionsState>()((set) => ({
  projectId: null,
  suggestions: [],
  status: { kind: "idle" },
  setStatus: (status) => set({ status }),
  setSuggestions: (projectId, suggestions) => set({ projectId, suggestions }),
  update: (id, patch) =>
    set((state) => ({ suggestions: state.suggestions.map((s) => (s.id === id ? { ...s, ...patch } : s)) })),
  remove: (ids) => set((state) => ({ suggestions: state.suggestions.filter((s) => !ids.includes(s.id)) })),
  reset: (projectId) => set({ projectId, suggestions: [], status: { kind: "idle" } }),
}));
