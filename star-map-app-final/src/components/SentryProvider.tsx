"use client";

/**
 * SQ-58 / issue #429 — kicks off @sentry/react initialization on mount.
 *
 * All initialization logic lives in @/lib/sentryBrowser behind a shared
 * promise, so error reports from boundaries that catch before this effect
 * runs still initialize and await the same client. Inert unless
 * NEXT_PUBLIC_SENTRY_DSN was set at build time.
 */
import { useEffect } from "react";
import { initSentryBrowser } from "@/lib/sentryBrowser";

export default function SentryProvider() {
  useEffect(() => {
    initSentryBrowser();
  }, []);

  return null;
}
