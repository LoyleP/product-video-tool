import { insertZoom } from "@/store/edits";
import { useEditorStore } from "@/store/editor-store";
import { useProjectStore } from "@/store/project-store";
import { useSuggestionsStore } from "@/store/suggestions-store";
import { suggestionToZoom } from "./suggest-zooms";

/** Accepts suggestions as auto zooms in one undo step. Returns how many were added. */
export function acceptSuggestions(ids: string[]): number {
  const { suggestions, remove } = useSuggestionsStore.getState();
  const chosen = suggestions.filter((s) => ids.includes(s.id));
  let added: string[] = [];
  useProjectStore.getState().commit((d) => {
    added = [];
    for (const s of chosen) if (insertZoom(d, suggestionToZoom(s))) added.push(s.id);
    return added.length > 0;
  });
  // Suggestions that no longer fit (another zoom took the spot) are dropped as well.
  remove(chosen.map((s) => s.id));
  const { selection, select } = useEditorStore.getState();
  if (added.length === 1) select({ kind: "zoom", id: added[0]! });
  else if (selection?.kind === "suggestion" && ids.includes(selection.id)) select(null);
  return added.length;
}

export function dismissSuggestions(ids: string[]): void {
  useSuggestionsStore.getState().remove(ids);
  const { selection, select } = useEditorStore.getState();
  if (selection?.kind === "suggestion" && ids.includes(selection.id)) select(null);
}
