"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { getReferralAttributionFromSearchParams } from "@/lib/referralAttribution";
import { storeClientMarketingAttribution } from "@/lib/marketingAttributionStorage";

const UTM_CAPTURED_KEY = "starmap_utm_captured";

/** Stores Google Ads (and other) UTMs in starmap_ref_src for checkout — without a referral code. */
export default function UtmAttributionClient() {
  const searchParams = useSearchParams();
  const sentRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const attribution = getReferralAttributionFromSearchParams(searchParams);
    if (
      !attribution?.source &&
      !attribution?.medium &&
      !attribution?.campaign &&
      !attribution?.content
    ) {
      return;
    }

    storeClientMarketingAttribution(attribution);

    try {
      if (sessionStorage.getItem(UTM_CAPTURED_KEY) === "1") return;
    } catch {
      /* ignore */
    }

    if (sentRef.current) return;
    sentRef.current = true;
    void fetch("/api/marketing-attribution", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(attribution),
      credentials: "same-origin",
    })
      .then((res) => {
        if (!res.ok) {
          sentRef.current = false;
          return;
        }
        try {
          sessionStorage.setItem(UTM_CAPTURED_KEY, "1");
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        sentRef.current = false;
      });
  }, [searchParams]);

  return null;
}
