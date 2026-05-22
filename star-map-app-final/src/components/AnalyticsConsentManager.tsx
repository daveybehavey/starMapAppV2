"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import PosthogProvider from "@/components/PosthogProvider";
import { ANALYTICS_STORAGE_KEY, flushPendingGa4Purchase, trackPageView } from "@/lib/analytics";

type ConsentState = "granted" | "denied" | "unset";

const GA_EXTERNAL_SCRIPT_ID = "ga4-external-script";

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

function readConsentState(): ConsentState {
  if (typeof window === "undefined") return "unset";
  try {
    const stored = localStorage.getItem(ANALYTICS_STORAGE_KEY);
    if (stored === "true") return "granted";
    if (stored === "false") return "denied";
  } catch {
    // Ignore storage failures and fallback to unset.
  }
  return "unset";
}

function ensureGaBootstrap(gaId: string) {
  if (typeof window === "undefined") return;
  const disableKey = `ga-disable-${gaId}` as const;
  (window as unknown as Record<string, unknown>)[disableKey] = false;

  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== "function") {
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    };
  }

  const existingExternal = document.getElementById(GA_EXTERNAL_SCRIPT_ID);
  if (!existingExternal) {
    const externalScript = document.createElement("script");
    externalScript.id = GA_EXTERNAL_SCRIPT_ID;
    externalScript.async = true;
    externalScript.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
    document.head.appendChild(externalScript);
  }

  window.gtag("js", new Date());
  window.gtag("config", gaId, {
    anonymize_ip: true,
    allow_google_signals: false,
    send_page_view: false,
  });
}

function disableGa(gaId: string) {
  if (typeof window === "undefined") return;
  const disableKey = `ga-disable-${gaId}` as const;
  (window as unknown as Record<string, unknown>)[disableKey] = true;
}

export default function AnalyticsConsentManager() {
  const [consent, setConsent] = useState<ConsentState>("unset");
  const gaId = useMemo(() => process.env.NEXT_PUBLIC_GA_ID?.trim() || "", []);
  const pathname = usePathname();

  useEffect(() => {
    setConsent(readConsentState());
  }, []);

  useEffect(() => {
    if (!gaId) return;
    if (consent === "granted") {
      ensureGaBootstrap(gaId);
      flushPendingGa4Purchase();
      return;
    }
    disableGa(gaId);
  }, [consent, gaId]);

  useEffect(() => {
    if (!gaId || consent !== "granted") return;
    trackPageView({
      path: pathname || "/",
    });
  }, [consent, gaId, pathname]);

  const updateConsent = (next: Exclude<ConsentState, "unset">) => {
    setConsent(next);
    try {
      localStorage.setItem(ANALYTICS_STORAGE_KEY, next === "granted" ? "true" : "false");
    } catch {
      // Ignore storage failures.
    }
  };

  return (
    <>
      <PosthogProvider enabled={consent === "granted"} />
      {consent === "unset" ? (
        <aside className="cookie-banner" role="dialog" aria-live="polite" aria-label="Cookie consent">
          <p className="cookie-text text-sm">
            Optional analytics help improve StarMapCo. Accept or decline.
            <Link href="/privacy" prefetch={false} className="ml-1 underline">
              Privacy
            </Link>
            .
          </p>
          <div className="cookie-actions">
            <button
              type="button"
              className="cookie-btn cookie-btn-secondary"
              onClick={() => updateConsent("denied")}
            >
              Decline
            </button>
            <button
              type="button"
              className="cookie-btn cookie-btn-primary"
              onClick={() => updateConsent("granted")}
            >
              Allow
            </button>
          </div>
        </aside>
      ) : null}
    </>
  );
}
