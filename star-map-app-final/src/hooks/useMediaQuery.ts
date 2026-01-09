"use client";

import { useEffect, useState } from "react";

/**
 * SSR-safe media query hook with hydration handling
 * Returns false during SSR (mobile-first), then the actual value on client
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);

    // Set initial value
    setMatches(media.matches);

    // Create listener
    const listener = (e: MediaQueryListEvent) => {
      setMatches(e.matches);
    };

    // Modern browsers
    if (media.addEventListener) {
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    } else {
      // Legacy browsers
      media.addListener(listener);
      return () => media.removeListener(listener);
    }
  }, [query]);

  return matches;
}
