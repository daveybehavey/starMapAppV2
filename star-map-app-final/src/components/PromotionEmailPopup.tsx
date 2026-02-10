"use client";

import { useEffect, useState } from "react";
import { PromotionForm } from "@/components/PromotionSignup";
import { LightModal } from "@/components/ui/Modal";
import { getPricingInfo } from "@/lib/pricing";
import { track } from "@/lib/analytics";

const DISMISS_KEY = "starmap-20off-popup-dismissed";
const SUBSCRIBED_KEY = "starmap-20off-popup-subscribed";
const DISMISS_COOLDOWN_MS = 5 * 24 * 60 * 60 * 1000;

export default function PromotionEmailPopup() {
  const [isOpen, setIsOpen] = useState(false);
  const pricing = getPricingInfo();
  const disablePopup = process.env.NEXT_PUBLIC_DISABLE_PROMO_POPUP === "true";

  useEffect(() => {
    if (disablePopup) return;
    if (typeof window === "undefined") return;
    if (pricing.promoActive) return;

    const alreadySubscribed = window.localStorage.getItem(SUBSCRIBED_KEY);
    if (alreadySubscribed) return;

    const dismissed = window.localStorage.getItem(DISMISS_KEY);
    if (dismissed) {
      const dismissedAt = new Date(dismissed).getTime();
      if (Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_COOLDOWN_MS) {
        return;
      }
    }

    let mounted = true;
    let timer: number | null = null;

    const openPopup = () => {
      if (!mounted) return;
      setIsOpen(true);
      track("promotion_popup_viewed", { source: "modal" });
    };

    const handleIntent = () => {
      if (timer !== null) return;
      timer = window.setTimeout(openPopup, 1200);
      window.removeEventListener("scroll", handleIntent);
      window.removeEventListener("pointerdown", handleIntent);
      window.removeEventListener("keydown", handleIntent);
    };

    window.addEventListener("scroll", handleIntent, { passive: true });
    window.addEventListener("pointerdown", handleIntent, { passive: true });
    window.addEventListener("keydown", handleIntent);

    return () => {
      mounted = false;
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener("scroll", handleIntent);
      window.removeEventListener("pointerdown", handleIntent);
      window.removeEventListener("keydown", handleIntent);
    };
  }, [disablePopup, pricing.promoActive]);

  const closeModal = () => {
    setIsOpen(false);
    track("promotion_popup_closed", { source: "modal", reason: "dismissed" });
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    }
  };

  const handleSuccess = (payload: {
    couponCode?: string;
    isNewSubscriber: boolean;
    emailDelivered: boolean;
    deliveryProvider?: string;
  }) => {
    if (typeof window === "undefined") return;
    track("promotion_popup_converted", {
      source: "modal",
      couponCode: payload.couponCode,
      isNewSubscriber: payload.isNewSubscriber,
      emailDelivered: payload.emailDelivered,
      deliveryProvider: payload.deliveryProvider,
    });
    window.localStorage.setItem(SUBSCRIBED_KEY, "1");
    window.localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    window.setTimeout(() => setIsOpen(false), 1800);
  };

  if (disablePopup || !isOpen) return null;

  return (
    <LightModal
      isOpen={isOpen}
      onClose={closeModal}
      title="Instant 20% off code"
      description="Give us your email and we’ll send a one-time 20% off coupon plus rare updates."
      size="md"
      className="!shadow-[0_24px_60px_rgba(12,18,36,0.25)]"
    >
      <div className="space-y-3 text-neutral-800">
        <p className="text-sm text-neutral-700">
          Join the list for a one-time 20% off code.
        </p>
        <PromotionForm
          buttonLabel="Send me the 20% code"
          inputVariant="dark"
          hideDisclaimer
          source="popup_modal"
          onSuccess={handleSuccess}
        />
        <p className="text-[11px] text-neutral-500">
          By submitting, you agree to receive marketing emails. You can unsubscribe anytime.
        </p>
      </div>
    </LightModal>
  );
}
