"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com";

export default function PosthogProvider() {
  useEffect(() => {
    if (!key) return;
    posthog.init(key, {
      api_host: host,
      autocapture: true,
      capture_pageview: true,
      persistence: "localStorage",
    });
    return () => {
      posthog.shutdown();
    };
  }, []);

  return null;
}
