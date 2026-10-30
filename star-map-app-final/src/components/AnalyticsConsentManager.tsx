"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import PosthogProvider from "@/components/PosthogProvider";
import {
  ANALYTICS_STORAGE_KEY,
  applyGaConsentDefault,
  applyGaConsentUpdate,
  flushPendingGa4Purchase,
  sendGaPageView,
  trackProviderPageView,
} from "@/lib/analytics";
import { ensureGoogleTagManagerLoaded, getGtmContainerId } from "@/lib/googleTagManager";
import { ensurePinterestTagLoaded, getPinterestTagId } from "@/lib/pinterestTag";

type ConsentState = "granted" | "denied" | "unset";

const GA_EXTERNAL_SCRIPT_ID = "ga4-external-script";

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
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

let gaBootstrapped = false;
let gaConsentUpdateAppliedFor: ConsentState | null = null;

function ensureGaBootstrap(gaId: string) {
  if (typeof window === "undefined") return;
  if (gaBootstrapped) return;
  gaBootstrapped = true;

  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== "function") {
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer?.push(args as unknown as Record<string, unknown>);
    };
  }

  // Consent Mode v2: the denied default is queued before the tag configures
  // so denied-state visits still send cookieless pings. A returning granted
  // visitor's update is queued before config too, so their hits carry
  // storage from the first event.
  applyGaConsentDefault();
  if (readConsentState() === "granted") {
    applyGaConsentUpdate(true);
    gaConsentUpdateAppliedFor = "granted";
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

/** Push the consent update for a settled banner choice, once per state. */
function syncGaConsentUpdate(state: ConsentState) {
  if (state === "unset") return;
  if (gaConsentUpdateAppliedFor === state) return;
  applyGaConsentUpdate(state === "granted");
  gaConsentUpdateAppliedFor = state;
}

export default function AnalyticsConsentManager() {
  const [consent, setConsent] = useState<ConsentState>("unset");
  const gaId = useMemo(() => process.env.NEXT_PUBLIC_GA_ID?.trim() || "", []);
  const gtmId = useMemo(() => getGtmContainerId(), []);
  const pinterestTagId = useMemo(() => getPinterestTagId(), []);
  const pathname = usePathname();

  useEffect(() => {
    setConsent(readConsentState());
    const onExternalGrant = () => setConsent(readConsentState());
    window.addEventListener("starmap:analytics-consent", onExternalGrant);
    return () => window.removeEventListener("starmap:analytics-consent", onExternalGrant);
  }, []);

  useEffect(() => {
    if (consent !== "granted") return;
    if (gtmId) ensureGoogleTagManagerLoaded(gtmId);
    if (pinterestTagId) ensurePinterestTagLoaded(pinterestTagId);
  }, [consent, gtmId, pinterestTagId]);

  useEffect(() => {
    if (!gaId) return;
    // gtag.js loads for every visitor; consent state rides on the Consent
    // Mode default/update calls instead of gating the tag itself.
    ensureGaBootstrap(gaId);
    syncGaConsentUpdate(consent);
    if (consent === "granted") {
      flushPendingGa4Purchase();
    }
  }, [consent, gaId]);

  // Granted-only provider page views: the GTM dataLayer push and the
  // Pinterest page view that the pre-Consent-Mode page-view helper used to
  // emit on navigation. GTM and Pinterest stay granted-only, so this runs
  // only for granted visitors — once per navigation, and once when a
  // visitor grants mid-page (the landing page's provider view they would
  // have had before). It emits NO GA event: the GA page_view comes solely
  // from the all-states dispatcher below, so it can never double-fire.
  useEffect(() => {
    if (consent !== "granted") return;
    if (!gtmId && !pinterestTagId) return;
    trackProviderPageView({
      path: pathname || "/",
    });
  }, [consent, gtmId, pinterestTagId, pathname]);

  // Single GA page-view dispatcher, for EVERY consent state. Under Consent
  // Mode v2 the consent default/update queued by the bootstrap effect above
  // (which runs first) governs storage; the page_view ping itself is what
  // gives denied/unset visits aggregate visibility, so it must not be
  // consent-gated. Deps exclude `consent` on purpose: a banner decision is
  // not a navigation and must not re-fire a page view, and granted visitors
  // get exactly one page_view per navigation from here alone.
  useEffect(() => {
    if (!gaId) return;
    sendGaPageView(pathname || "/");
  }, [gaId, pathname]);

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
