"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { isDoNotTrackEnabled } from "@/lib/analytics";

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com";

type Props = {
  enabled?: boolean;
};

export default function PosthogProvider({ enabled = true }: Props) {
  useEffect(() => {
    if (!key || !enabled || isDoNotTrackEnabled()) {
      posthog.opt_out_capturing?.();
      return;
    }
    posthog.init(key, {
      api_host: host,
      autocapture: false,
      capture_pageview: true,
      persistence: "localStorage",
      respect_dnt: true,
      mask_all_text: true,
      mask_all_element_attributes: true,
      mask_personal_data_properties: true,
      disable_session_recording: true,
    });
    return () => {
      posthog.reset?.();
    };
  }, [enabled, host, key]);

  return null;
}
