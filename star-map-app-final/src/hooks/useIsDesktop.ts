"use client";

import { useSyncExternalStore } from "react";

const subscribe = (callback: () => void) => {
  // Listen to resize events instead of just media query changes
  window.addEventListener("resize", callback);
  const media = window.matchMedia("(min-width: 1024px)");
  media.addEventListener("change", callback);
  return () => {
    window.removeEventListener("resize", callback);
    media.removeEventListener("change", callback);
  };
};

const getSnapshot = () => {
  // Check actual window width as fallback if media query doesn't work (Playwright issue)
  if (typeof window !== 'undefined') {
    const mediaMatches = window.matchMedia("(min-width: 1024px)").matches;
    const widthCheck = window.innerWidth >= 1024;
    // Use width check if media query returns false but width is actually >= 1024
    return mediaMatches || widthCheck;
  }
  return false;
};

const getServerSnapshot = () => {
  return false; // SSR: assume mobile-first
};

/**
 * Hook that returns true if viewport is desktop (≥1024px)
 * Uses useSyncExternalStore for immediate, synchronous updates
 * Falls back to window.innerWidth check for Playwright compatibility
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
