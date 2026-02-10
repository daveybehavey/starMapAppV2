"use client";

import dynamic from "next/dynamic";

const CookieBanner = dynamic(() => import("@/components/CookieBanner"), { ssr: false });
const PromotionEmailPopup = dynamic(() => import("@/components/PromotionEmailPopup"), { ssr: false });

export default function ClientOverlays() {
  return (
    <>
      <CookieBanner />
      <PromotionEmailPopup />
    </>
  );
}
