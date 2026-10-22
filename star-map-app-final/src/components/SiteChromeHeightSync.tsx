"use client";

import { useEffect } from "react";

/**
 * Keeps the `--site-chrome-height` CSS variable (globals.css) equal to the
 * real stacked height of the top chrome: the Christmas banner when it is
 * rendered, plus the sticky SiteTopNav header.
 *
 * The homepage hero sizes itself as `100dvh - var(--site-chrome-height)`.
 * It previously subtracted only the fixed header constant, so whenever the
 * banner was visible the hero's bottom trust strip fell below the fold by
 * exactly the banner's rendered height.
 *
 * The heights are measured from the rendered elements rather than
 * hardcoded, so the math stays correct when the banner wraps to a
 * different number of lines, changes copy or campaign phase, or is not
 * rendered at all (out of season the variable falls back to the header
 * height alone, and the hero returns to `100dvh - header` with no gap).
 */
export default function SiteChromeHeightSync() {
  useEffect(() => {
    const root = document.documentElement;
    const findBanner = () =>
      document.querySelector<HTMLElement>("[data-site-chrome-banner]");
    const findNav = () =>
      document.querySelector<HTMLElement>("[data-site-chrome-nav]");

    const update = () => {
      const height =
        (findBanner()?.offsetHeight ?? 0) + (findNav()?.offsetHeight ?? 0);
      if (height > 0) {
        root.style.setProperty("--site-chrome-height", `${height}px`);
      }
    };

    update();

    // Track re-wraps (viewport resizes change the banner's line count).
    const resizeObserver = new ResizeObserver(update);
    const observed = new Set<Element>();
    const observeChrome = () => {
      for (const el of [findBanner(), findNav()]) {
        if (el && !observed.has(el)) {
          observed.add(el);
          resizeObserver.observe(el);
        }
      }
    };
    observeChrome();

    // The banner mounts and unmounts through a Suspense boundary and by
    // season, and the nav unmounts on chrome-less routes: watch their
    // shared container so appearance/disappearance re-measures. The
    // container is the stable .cosmic-backdrop wrapper from the root
    // layout, selected directly rather than via the chrome elements:
    // on a chrome-less route both elements are absent (null), and
    // falling back to document.body with childList-only observation
    // would miss the banner/nav mounting inside the wrapper when the
    // user navigates client-side to a chromed route.
    const chromeContainer =
      document.querySelector(".cosmic-backdrop") ??
      findNav()?.parentElement ??
      findBanner()?.parentElement ??
      document.body;
    const mutationObserver = new MutationObserver(() => {
      observeChrome();
      update();
    });
    mutationObserver.observe(chromeContainer, { childList: true });

    window.addEventListener("resize", update);
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  return null;
}
