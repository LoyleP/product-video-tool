"use client";

import { useEffect, useState } from "react";
import type { Project } from "@/schema/project";
import { saveProject } from "@/storage/projects";

/** Saves the project to IndexedDB one second after the last change (BUILD.md section 8). */
export function useAutosave(project: Project | null): { error: string | null } {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!project) return;
    const timer = setTimeout(() => {
      saveProject(project)
        .then(() => setError(null))
        .catch((e: unknown) => {
          console.error(e);
          setError("Changes couldn't be saved to browser storage.");
        });
    }, 1000);
    return () => clearTimeout(timer);
  }, [project]);

  return { error };
}
