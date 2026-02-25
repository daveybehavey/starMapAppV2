"use client";

import { useEffect, useRef } from "react";
import { track, trackFunnelStep } from "@/lib/analytics";

type LandingViewTrackerProps = {
  source?: string;
};

const LANDING_VIEW_SEEN_KEY = "funnel:landing_view:seen";

export function LandingViewTracker({ source = "home" }: LandingViewTrackerProps) {
  const sentRef = useRef(false);

  useEffect(() => {
    if (sentRef.current) return;
    sentRef.current = true;

    try {
      if (sessionStorage.getItem(LANDING_VIEW_SEEN_KEY) === "true") return;
      sessionStorage.setItem(LANDING_VIEW_SEEN_KEY, "true");
    } catch {
      // Ignore storage errors; fallback to ref-based dedupe.
    }

    track("landing_view", { source });
    trackFunnelStep("landing_view", { source });
  }, [source]);

  return null;
}

