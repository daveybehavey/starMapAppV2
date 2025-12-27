"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com";

type Props = {
  enabled?: boolean;
};

export default function PosthogProvider({ enabled = true }: Props) {
  useEffect(() => {
    if (!key || !enabled) return;
    posthog.init(key, {
      api_host: host,
      autocapture: true,
      capture_pageview: true,
      persistence: "localStorage",
    });
    return () => {
      if (typeof posthog.shutdown === "function") {
        posthog.shutdown();
      } else if (typeof posthog.reset === "function") {
        posthog.reset();
      }
    };
  }, []);

  return null;
}
