"use client";

import { useState } from "react";
import { createCheckoutHandoffToken } from "@/lib/analytics";
import type { GiftCertificateTierId } from "@/lib/giftCertificates";

type TierOption = {
  tierId: GiftCertificateTierId;
  plan: "single" | "pack3";
  label: string;
  priceLines: string[];
  blurb: string;
};

/**
 * Gift-certificate purchase buttons. Starts a certificate checkout
 * through the ordinary POST /api/checkout (the editor's path) with
 * `giftCertificate: true` — the server forces the certificate terms:
 * digital tier at the book price, no promo/referral discount, no map,
 * and a webhook-minted redeem code instead of a buyer entitlement.
 */
export default function GiftCertificateBuy({ tiers }: { tiers: TierOption[] }) {
  const [busyTier, setBusyTier] = useState<GiftCertificateTierId | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout(tier: TierOption) {
    if (busyTier) return;
    setBusyTier(tier.tierId);
    setError(null);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: tier.plan,
          orderType: "digital",
          isGift: true,
          giftCertificate: true,
          checkoutHandoff: createCheckoutHandoffToken(),
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { url?: string; error?: string }
        | null;
      if (!response.ok || !data?.url) {
        throw new Error(data?.error || "Checkout couldn't start. Please try again.");
      }
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout couldn't start. Please try again.");
      setBusyTier(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {tiers.map((tier) => (
          <div
            key={tier.tierId}
            className="flex flex-col rounded-2xl border border-white/15 bg-white/5 p-5 text-left"
          >
            <h3 className="text-lg font-semibold text-white">{tier.label} gift certificate</h3>
            <p className="mt-1 text-sm text-neutral-300">{tier.blurb}</p>
            <p className="mt-3 text-sm font-semibold text-amber-200">{tier.priceLines.join(" · ")}</p>
            <button
              type="button"
              onClick={() => startCheckout(tier)}
              disabled={busyTier !== null}
              className="text-midnight mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-transparent focus:outline-none disabled:cursor-wait disabled:opacity-70"
            >
              {busyTier === tier.tierId ? "Opening secure checkout…" : `Buy ${tier.label} certificate`}
            </button>
          </div>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      ) : null}
      <p className="text-xs text-neutral-400">
        Secure Stripe checkout. The certificate email goes to the email you enter at checkout.
      </p>
    </div>
  );
}
