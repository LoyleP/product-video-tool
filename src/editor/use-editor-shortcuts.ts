"use client";

import { useEffect } from "react";
import { projectDuration } from "@/engine/timeline";
import { addText, addZoom, deleteClip, deleteGesture, deleteText, deleteZoom, splitClip } from "@/store/edits";
import { useEditorStore } from "@/store/editor-store";
import { useProjectStore } from "@/store/project-store";
import type { Player } from "./preview/player";

/** Controls that handle these keys themselves. Space also activates focused buttons. */
function ownsKey(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return true;
  if (key === " " && (target.tagName === "BUTTON" || target.getAttribute("role") === "button")) return true;
  if (key.startsWith("Arrow") || key === "Home" || key === "End" || key === "PageUp" || key === "PageDown") {
    return target.getAttribute("role") === "slider";
  }
  return false;
}

/** Editor keyboard shortcuts (BUILD.md section 8). */
export function useEditorShortcuts(player: Player | null) {
  useEffect(() => {
    if (!player) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || ownsKey(e.target, e.key)) return;
      const mod = e.metaKey || e.ctrlKey;
      const { commit, undo, redo, project } = useProjectStore.getState();
      const { selection, select } = useEditorStore.getState();
      if (!project) return;
      const key = e.key.toLowerCase();

      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        player.projectChanged();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        redo();
        player.projectChanged();
        return;
      }
      if (mod || e.altKey) return;

      const handled = (() => {
        switch (key) {
          case " ":
            if (e.repeat) return true;
            player.toggle();
            return true;
          case "k":
            player.pause();
            return true;
          case "l":
            player.shuttle(1);
            return true;
          case "j":
            player.shuttle(-1);
            return true;
          case "arrowleft":
            player.step(e.shiftKey ? -project.canvas.fps : -1);
            return true;
          case "arrowright":
            player.step(e.shiftKey ? project.canvas.fps : 1);
            return true;
          case "home":
            player.seek(0);
            return true;
          case "end":
            player.seek(Number.MAX_SAFE_INTEGER);
            return true;
          case "s": {
            const t = player.getState().time;
            const clipId = selection?.kind === "clip" ? selection.id : undefined;
            if (!commit((d) => splitClip(d, t, crypto.randomUUID(), clipId)) && clipId) {
              commit((d) => splitClip(d, t, crypto.randomUUID()));
            }
            return true;
          }
          case "z": {
            const id = crypto.randomUUID();
            const t = player.getState().time;
            if (commit((d) => addZoom(d, t, id, projectDuration(project)) !== null)) select({ kind: "zoom", id });
            return true;
          }
          case "t": {
            const id = crypto.randomUUID();
            const t = player.getState().time;
            if (commit((d) => addText(d, t, id, crypto.randomUUID(), projectDuration(project)))) select({ kind: "text", id });
            return true;
          }
          case "g": {
            const { gestureTool, setGestureTool } = useEditorStore.getState();
            setGestureTool(!gestureTool);
            return true;
          }
          case "delete":
          case "backspace": {
            if (!selection) return false;
            const remove = { clip: deleteClip, zoom: deleteZoom, text: deleteText, gesture: deleteGesture }[selection.kind];
            if (commit((d) => remove(d, selection.id))) select(null);
            return true;
          }
          case "escape":
            select(null);
            useEditorStore.getState().setGestureTool(false);
            return true;
          default:
            return false;
        }
      })();
      if (handled) e.preventDefault();
      if (handled && ["s", "delete", "backspace"].includes(key)) player.projectChanged();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [player]);
}
