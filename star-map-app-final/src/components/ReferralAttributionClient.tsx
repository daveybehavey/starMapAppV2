"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { normalizeReferralCode, writeStoredReferralCode } from "@/lib/referrals";

export default function ReferralAttributionClient() {
  const searchParams = useSearchParams();
  const lastHandledCodeRef = useRef<string | null>(null);
  const queryReferralCode = normalizeReferralCode(searchParams.get("ref"));

  useEffect(() => {
    if (!queryReferralCode || typeof window === "undefined") return;
    if (lastHandledCodeRef.current === queryReferralCode) return;
    lastHandledCodeRef.current = queryReferralCode;
    writeStoredReferralCode(queryReferralCode);

    void fetch("/api/referrals/attribution", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: queryReferralCode }),
    }).catch(() => {
      // ignore attribution failures; checkout still has localStorage fallback
    });

    const marker = `referral-visit:${queryReferralCode}`;
    try {
      if (window.sessionStorage.getItem(marker) === "1") {
        return;
      }
      window.sessionStorage.setItem(marker, "1");
    } catch {
      // ignore sessionStorage errors
    }

    void fetch("/api/referrals/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: queryReferralCode }),
    }).then((res) => {
      if (res.ok) return;
      try {
        window.sessionStorage.removeItem(marker);
      } catch {
        // ignore sessionStorage errors
      }
    }).catch(() => {
      try {
        window.sessionStorage.removeItem(marker);
      } catch {
        // ignore sessionStorage errors
      }
    });
  }, [queryReferralCode]);

  return null;
}
