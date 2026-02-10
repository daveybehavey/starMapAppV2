"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const CookieBanner = dynamic(() => import("@/components/CookieBanner"), { ssr: false });
const PromotionEmailPopup = dynamic(() => import("@/components/PromotionEmailPopup"), { ssr: false });

export default function ClientOverlays() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const idleCallback = window.requestIdleCallback as
      | ((cb: () => void, opts?: { timeout?: number }) => number)
      | undefined;

    if (typeof idleCallback === "function") {
      const handle = idleCallback(() => {
        document.body.classList.add("enhanced-visuals");
        setReady(true);
      }, { timeout: 2000 });
      return () => window.cancelIdleCallback?.(handle);
    }

    const handle = window.setTimeout(() => {
      document.body.classList.add("enhanced-visuals");
      setReady(true);
    }, 2000);
    return () => window.clearTimeout(handle);
  }, []);

  if (!ready) return null;

  return (
    <>
      <CookieBanner />
      <PromotionEmailPopup />
    </>
  );
}
