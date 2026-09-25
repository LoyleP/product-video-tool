import type { Metadata } from "next";
import { DesktopGate } from "@/editor/desktop-gate";
import { EditorWorkspace } from "@/editor/workspace";

export const metadata: Metadata = { title: "Editor" };

export default async function ProjectPage({ params }: PageProps<"/editor/[projectId]">) {
  const { projectId } = await params;
  return (
    <DesktopGate>
      <EditorWorkspace projectId={projectId} />
    </DesktopGate>
  );
}
