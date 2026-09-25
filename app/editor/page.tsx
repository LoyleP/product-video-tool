import type { Metadata } from "next";
import { DesktopGate } from "@/editor/desktop-gate";
import { ImportScreen } from "@/editor/import/import-screen";

export const metadata: Metadata = { title: "New project" };

export default function NewProjectPage() {
  return (
    <DesktopGate>
      <ImportScreen />
    </DesktopGate>
  );
}
