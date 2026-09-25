"use client";

import { useSyncExternalStore } from "react";
import { detectCapabilities, isEditorSupported, type Capabilities } from "@/lib/capabilities";
import { CapabilitiesPanel } from "./capabilities-panel";
import { DesktopOnly } from "./desktop-only";

let cachedCapabilities: Capabilities | null = null;

const subscribe = () => () => {};
const getSnapshot = () => (cachedCapabilities ??= detectCapabilities());
const getServerSnapshot = () => null;

export function EditorEntry() {
  const caps = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!caps) return <div className="flex-1 bg-background" aria-busy="true" />;
  if (!isEditorSupported(caps)) return <DesktopOnly />;

  return (
    <div className="flex h-dvh min-w-[1280px] flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center border-b px-4 text-sm font-medium">Untitled project</header>
      <div className="flex min-h-0 flex-1">
        <aside aria-label="Presets and backgrounds" className="w-64 shrink-0 border-r p-4">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Presets</h2>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <section aria-label="Preview" className="flex flex-1 items-center justify-center p-8">
            <div className="flex aspect-video w-full max-w-4xl items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
              Import arrives in Phase 1
            </div>
          </section>
          <section aria-label="Timeline" className="h-56 shrink-0 border-t" />
        </main>
        <aside aria-label="Inspector" className="w-80 shrink-0 overflow-y-auto border-l p-4">
          <CapabilitiesPanel caps={caps} />
        </aside>
      </div>
    </div>
  );
}
