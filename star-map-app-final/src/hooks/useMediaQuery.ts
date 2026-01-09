"use client";

import { useEffect, useState } from "react";

/**
 * SSR-safe media query hook with Playwright-safe initialization
 * Returns null during SSR, then evaluates media query after mount
 * Forces synchronous check after mount to handle Playwright viewport timing
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean | null>(null);

  useEffect(() => {
    const media = window.matchMedia(query);

    // Force synchronous check after mount (critical for Playwright)
    const update = () => {
      console.log(`[useMediaQuery] Query: ${query}, Matches: ${media.matches}, Window width: ${window.innerWidth}`);
      setMatches(media.matches);
    };
    update();

    // Listen for changes
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  // During first render (before client effect), return false (mobile-first)
  return matches ?? false;
}
