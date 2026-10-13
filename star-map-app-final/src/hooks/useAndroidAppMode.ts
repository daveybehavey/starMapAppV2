"use client";

import { useSyncExternalStore } from "react";
import { isAndroidAppModeClient } from "@/lib/androidAppMode";

const subscribe = () => () => {};

/**
 * Reads the pre-paint <html data-app-mode> flag synchronously on the client, so components
 * mounted after hydration (e.g. PaywallModal) render app-mode UI on their very first paint.
 * The server snapshot is false; the bootstrap never changes the flag after first paint.
 */
export function useAndroidAppMode(): boolean {
  return useSyncExternalStore(subscribe, isAndroidAppModeClient, () => false);
}
