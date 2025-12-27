"use client";

import { useEffect, useState } from "react";
import PosthogProvider from "./PosthogProvider";
import { Analytics as VercelAnalytics } from "@vercel/analytics/react";
import Script from "next/script";

const CONSENT_KEY = "analytics-consent";
const gaId = process.env.NEXT_PUBLIC_GA_ID;

export default function ConsentManager() {
  const [consented, setConsented] = useState<boolean | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (stored === "true") setConsented(true);
    if (stored === "false") setConsented(false);
    if (stored === null) setConsented(false);
  }, []);

  const handleAccept = () => {
    localStorage.setItem(CONSENT_KEY, "true");
    setConsented(true);
  };

  const handleDecline = () => {
    localStorage.setItem(CONSENT_KEY, "false");
    setConsented(false);
  };

  return (
    <>
      {consented && (
        <>
          <PosthogProvider enabled />
          {gaId ? (
            <>
              <Script
                src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
                strategy="afterInteractive"
              />
              <Script id="ga4-init" strategy="afterInteractive">
                {`
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${gaId}');
                `}
              </Script>
            </>
          ) : null}
          <VercelAnalytics />
        </>
      )}
      {consented === false && (
        <div className="fixed bottom-4 left-1/2 z-50 w-[95%] max-w-3xl -translate-x-1/2 rounded-2xl border border-amber-200 bg-[rgba(247,241,227,0.95)] px-4 py-3 shadow-lg shadow-black/20 backdrop-blur">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-neutral-800">
              We use analytics (Posthog, GA4, Vercel) to improve performance and experience. Do you consent?
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleDecline}
                className="rounded-full border border-amber-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm transition hover:-translate-y-[1px] hover:shadow"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={handleAccept}
                className="rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-1.5 text-xs font-semibold text-midnight shadow-md transition hover:-translate-y-[1px] hover:shadow-lg"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
