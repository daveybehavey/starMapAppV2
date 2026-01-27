"use client";

import { useEffect, useState } from "react";
import { getPricingInfo, formatPrice } from "@/lib/pricing";
import { useFocusTrap } from "@/components/ui/useFocusTrap";

const POPUP_DISMISSED_KEY = "starmap-promo-popup-dismissed";

export default function PromoPopup() {
  const [isOpen, setIsOpen] = useState(false);
  const pricing = getPricingInfo();
  const modalRef = useFocusTrap<HTMLDivElement>(isOpen);

  useEffect(() => {
    if (!pricing.promoActive || !pricing.promoAmountCents) return;

    const dismissed = localStorage.getItem(POPUP_DISMISSED_KEY);
    const dismissedDate = dismissed ? new Date(dismissed) : null;
    const now = new Date();

    // Show popup if never dismissed, or if dismissed more than 24 hours ago
    if (!dismissed || (dismissedDate && now.getTime() - dismissedDate.getTime() > 24 * 60 * 60 * 1000)) {
      let mounted = true;
      const timer = setTimeout(() => {
        if (mounted) setIsOpen(true);
      }, 3000); // Show after 3 seconds

      return () => {
        mounted = false;
        clearTimeout(timer);
      };
    }
  }, [pricing.promoActive, pricing.promoAmountCents]);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsOpen(false);
    localStorage.setItem(POPUP_DISMISSED_KEY, new Date().toISOString());
  };

  if (!isOpen || !pricing.promoActive || !pricing.promoAmountCents) return null;

  const savings = pricing.baseAmountCents - pricing.activeAmountCents;
  const percentOff = Math.round((savings / pricing.baseAmountCents) * 100);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="promo-popup-title"
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-md animate-[scale-in_0.3s_ease-out] rounded-3xl border-2 border-amber-400 bg-gradient-to-br from-amber-50 via-white to-amber-50 p-6 shadow-2xl"
      >
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-neutral-200 text-neutral-600 transition hover:bg-neutral-300 hover:text-neutral-800"
          aria-label="Close"
        >
          ✕
        </button>

        <div className="mb-4 text-center">
          <div className="mb-2 inline-flex items-center justify-center rounded-full bg-amber-400 px-4 py-1.5 text-sm font-bold text-midnight shadow-md">
            🎉 LIMITED TIME OFFER
          </div>
          <h2 id="promo-popup-title" className="mt-4 text-3xl font-bold text-midnight">
            {percentOff}% Off New Year Sale!
          </h2>
        </div>

        <div className="mb-6 text-center">
          <p className="mb-3 text-neutral-700">
            Get your premium HD star map for just:
          </p>
          <div className="flex items-center justify-center gap-3">
            <span className="text-2xl font-bold text-neutral-400 line-through">
              {formatPrice(pricing.baseAmountCents, pricing.currency)}
            </span>
            <span className="text-4xl font-bold text-amber-600">
              {formatPrice(pricing.activeAmountCents, pricing.currency)}
            </span>
          </div>
          <p className="mt-2 text-sm font-semibold text-amber-700">
            Save {formatPrice(savings, pricing.currency)}!
          </p>
        </div>

        <ul className="mb-6 space-y-2 text-sm text-neutral-700">
          <li className="flex items-start gap-2">
            <span className="text-amber-600">✓</span>
            <span>6000×6000px HD resolution</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-amber-600">✓</span>
            <span>No watermark, print-ready</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-amber-600">✓</span>
            <span>Instant digital download</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-amber-600">✓</span>
            <span>One-time payment, no subscription</span>
          </li>
        </ul>

        <div className="space-y-2">
          <button
            onClick={handleClose}
            className="w-full rounded-full bg-amber-400 px-6 py-3 text-base font-bold text-midnight shadow-lg transition hover:-translate-y-0.5 hover:bg-amber-500 hover:shadow-xl"
          >
            Create My Star Map Now
          </button>
          <button
            onClick={handleClose}
            className="w-full text-sm text-neutral-500 underline hover:text-neutral-700"
          >
            Maybe later
          </button>
        </div>

        {pricing.promoEnd && (
          <p className="mt-4 text-center text-xs font-semibold text-neutral-500">
            Offer ends {new Date(pricing.promoEnd).toLocaleDateString("en-US", { month: "long", day: "numeric" })}
          </p>
        )}
      </div>
    </div>
  );
}
