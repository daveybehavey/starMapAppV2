"use client";

import { useEffect, useState } from "react";
import { PromotionForm } from "@/components/PromotionForm";
import { LightModal } from "@/components/ui/Modal";
import { getPricingInfo } from "@/lib/pricing";
import { track } from "@/lib/analytics";

const DISMISS_KEY = "starmap-20off-popup-dismissed";
const SUBSCRIBED_KEY = "starmap-20off-popup-subscribed";
const DISMISS_COOLDOWN_MS = 5 * 24 * 60 * 60 * 1000;
const POPUP_DELAY_MS = 15_000;
const FORCE_POPUP_DELAY_MS = 45_000;
const MIN_SCROLL_PROGRESS = 0.35;
const MIN_SCROLL_PX = 420;
const EXIT_INTENT_TOP_PX = 20;

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
    let forceTimer: number | null = null;
    let opened = false;
    let delayPassed = false;

    const openPopup = (trigger: "scroll_depth" | "exit_intent" | "engaged_time") => {
      if (!mounted || opened || !delayPassed) return;
      opened = true;
      setIsOpen(true);
      track("promotion_popup_viewed", { source: "modal", trigger });
    };

    const handleScroll = () => {
      const doc = document.documentElement;
      const maxScroll = Math.max(1, doc.scrollHeight - window.innerHeight);
      const scrollProgress = window.scrollY / maxScroll;
      if (scrollProgress >= MIN_SCROLL_PROGRESS || window.scrollY >= MIN_SCROLL_PX) {
        openPopup("scroll_depth");
      }
    };

    const handleMouseLeave = (event: MouseEvent) => {
      if (event.clientY <= EXIT_INTENT_TOP_PX) {
        openPopup("exit_intent");
      }
    };

    timer = window.setTimeout(() => {
      delayPassed = true;
      handleScroll();
    }, POPUP_DELAY_MS);
    forceTimer = window.setTimeout(() => {
      delayPassed = true;
      openPopup("engaged_time");
    }, FORCE_POPUP_DELAY_MS);

    window.addEventListener("scroll", handleScroll, { passive: true });
    if (window.matchMedia("(pointer: fine)").matches) {
      document.addEventListener("mouseout", handleMouseLeave);
    }

    return () => {
      mounted = false;
      if (timer !== null) window.clearTimeout(timer);
      if (forceTimer !== null) window.clearTimeout(forceTimer);
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("mouseout", handleMouseLeave);
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
        <p className="text-[11px] text-neutral-600">
          By submitting, you agree to receive marketing emails. You can unsubscribe anytime.
        </p>
      </div>
    </LightModal>
  );
}
