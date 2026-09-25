"use client";

import type { ReactNode } from "react";
import { isEditorSupported } from "@/lib/capabilities";
import { DesktopOnly } from "./desktop-only";
import { useCapabilities } from "./use-capabilities";

/** Renders the editor only on desktop-class devices (BUILD.md section 4). */
export function DesktopGate({ children }: { children: ReactNode }) {
  const caps = useCapabilities();
  if (!caps) return <div className="flex-1 bg-background" aria-busy="true" />;
  if (!isEditorSupported(caps)) return <DesktopOnly />;
  return children;
}
