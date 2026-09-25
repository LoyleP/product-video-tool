"use client";

import { useSyncExternalStore } from "react";
import { detectCapabilities, type Capabilities } from "@/lib/capabilities";

let cached: Capabilities | null = null;

const subscribe = () => () => {};
const getSnapshot = () => (cached ??= detectCapabilities());
const getServerSnapshot = () => null;

/** Browser capabilities, or null during server rendering. */
export function useCapabilities(): Capabilities | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
