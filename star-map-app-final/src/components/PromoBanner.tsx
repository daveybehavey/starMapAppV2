"use client";

import { useEffect, useState, useRef } from "react";
import { getPricingInfo, formatPrice, type PricingInfo } from "@/lib/pricing";

export default function PromoBanner() {
  const [pricing, setPricing] = useState<PricingInfo | null>(null);
  const [timeLeft, setTimeLeft] = useState("");
  const [mounted, setMounted] = useState(false);
  const pricingRef = useRef<PricingInfo | null>(null);

  useEffect(() => {
    setMounted(true);
    const pricingInfo = getPricingInfo();
    setPricing(pricingInfo);
    pricingRef.current = pricingInfo;
  }, []);

  useEffect(() => {
    pricingRef.current = pricing;
  }, [pricing]);

  useEffect(() => {
    if (!pricing?.promoActive || !pricing?.promoEnd) return;

    const updateCountdown = () => {
      const now = new Date();
      const currentPricing = pricingRef.current;
      if (!currentPricing?.promoEnd) return;
      const end = new Date(currentPricing.promoEnd);
      const diff = end.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeLeft("Ended");
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h left`);
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m left`);
      } else {
        setTimeLeft(`${minutes}m left`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [pricing?.promoActive, pricing?.promoEnd]);

  if (!mounted || !pricing || !pricing.promoActive || !pricing.promoAmountCents) {
    return null;
  }

  const savings = pricing.baseAmountCents - pricing.activeAmountCents;
  const percentOff = Math.round((savings / pricing.baseAmountCents) * 100);

  return (
    <div className="sticky top-0 z-50 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 px-4 py-2 text-center shadow-lg">
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 text-sm font-bold text-midnight md:text-base">
        <span className="animate-pulse text-lg">🎉</span>
        <span>
          <span className="hidden sm:inline">New Year Sale: </span>
          <span className="text-white">{percentOff}% OFF</span>
          {" — "}
          <span className="line-through opacity-75">
            {formatPrice(pricing.baseAmountCents, pricing.currency)}
          </span>
          {" → "}
          <span className="text-white">
            {formatPrice(pricing.activeAmountCents, pricing.currency)}
          </span>
        </span>
        {mounted && timeLeft && (
          <>
            <span className="hidden md:inline">•</span>
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold text-midnight">
              ⏰ {timeLeft}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
