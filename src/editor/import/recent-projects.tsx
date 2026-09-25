"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Trash2Icon } from "lucide-react";
import { projectDuration } from "@/engine/timeline";
import { formatTime } from "@/lib/format-time";
import type { Project } from "@/schema/project";
import { deleteProject, listProjects } from "@/storage/projects";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Projects saved in this browser, to reopen or delete. */
export function RecentProjects() {
  const [projects, setProjects] = useState<Project[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listProjects()
      .then((list) => !cancelled && setProjects(list))
      .catch((e: unknown) => {
        console.warn(e);
        if (!cancelled) setProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!projects || projects.length === 0) return null;

  return (
    <section aria-labelledby="recent-heading" className="w-full max-w-2xl space-y-3">
      <h2 id="recent-heading" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Recent projects
      </h2>
      <ul className="divide-y rounded-xl border" data-testid="recent-projects">
        {projects.map((project) => (
          <li key={project.id} className="flex items-center gap-3 px-4 py-3">
            <Link href={`/editor/${project.id}`} className="min-w-0 flex-1 outline-none focus-visible:underline">
              <span className="block truncate text-sm font-medium">{project.name}</span>
              <span className="block font-mono text-xs text-muted-foreground">
                {formatTime(projectDuration(project))} · edited {dateFormat.format(new Date(project.updatedAt))}
              </span>
            </Link>
            <button
              type="button"
              aria-label={`Delete ${project.name}`}
              title="Delete project"
              onClick={async () => {
                if (!window.confirm(`Delete "${project.name}"? Its video is removed from this browser too.`)) return;
                await deleteProject(project);
                setProjects((list) => list?.filter((p) => p.id !== project.id) ?? null);
              }}
              className="rounded p-1.5 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Trash2Icon className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
