"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import PosthogProvider from "./PosthogProvider";
import { Analytics as VercelAnalytics } from "@vercel/analytics/react";

const COOKIE_KEY = "cookiesAccepted";
const ANALYTICS_KEY = "analytics-consent";
const gaId = process.env.NEXT_PUBLIC_GA_ID;

export default function CookieBanner() {
  const [consented, setConsented] = useState<boolean | null>(null);

  useEffect(() => {
    const hasCookieConsent = typeof window !== "undefined" ? localStorage.getItem(COOKIE_KEY) === "true" : false;
    const hasAnalyticsConsent =
      typeof window !== "undefined" ? localStorage.getItem(ANALYTICS_KEY) === "true" : false;
    if (hasCookieConsent || hasAnalyticsConsent) {
      setConsented(true);
    } else {
      setConsented(false);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(COOKIE_KEY, "true");
    localStorage.setItem(ANALYTICS_KEY, "true");
    setConsented(true);
  };

  return (
    <>
      {consented ? (
        <>
          <PosthogProvider enabled />
          {gaId ? (
            <>
              <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />
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
      ) : null}

      {consented === false && (
        <div className="cookie-banner">
          <div className="cookie-text">
            We use cookies to analyze traffic and improve your experience on StarMapCo. By continuing, you accept our
            use of cookies. Read our{" "}
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>
            .
          </div>
          <div className="cookie-actions">
            <button type="button" className="cookie-btn cookie-btn-primary" onClick={handleAccept}>
              Accept
            </button>
            <button type="button" className="cookie-btn cookie-btn-secondary" onClick={handleAccept}>
              Manage Preferences
            </button>
          </div>
        </div>
      )}
    </>
  );
}
