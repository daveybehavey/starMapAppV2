"use client";

import { useEffect, useState } from "react";
import type { CheckoutPlan } from "@/lib/pricing";
import type { PrintVariant } from "@/lib/pricing";
import type { PaywallCopyVariant } from "@/lib/experiments";

type PriceLabels = {
  single: string;
  pack3: string;
  subscription: string;
};

type Props = {
  checkoutInFlight: boolean;
  checkoutError: string | null;
  priceLabels: PriceLabels;
  printPriceLabels?: {
    unframed: string;
    framed: string;
    digitalAddOn: string;
  };
  variant: PaywallCopyVariant;
  purchaseIntent?: "digital" | "print";
  preferredPrintVariant?: PrintVariant;
  showReferralHint?: boolean;
  onStartCheckout: (plan: CheckoutPlan) => void;
  onStartPrintCheckout?: (options: { variant: PrintVariant; includeDigitalAddOn: boolean }) => void;
  onClose: () => void;
};

const PAYWALL_COPY: Record<
  PaywallCopyVariant,
  {
    title: string;
    subtitle: string;
    singleCta: string;
    packCta: string;
    subscriptionCta: string;
    badgeLabel: string;
  }
> = {
  control: {
    title: "Download your print-ready star map",
    subtitle: "Free preview stays available. Unlock HD only when you are ready to export.",
    singleCta: "Continue with single",
    packCta: "Get 3 downloads",
    subscriptionCta: "Start unlimited",
    badgeLabel: "Best value",
  },
  value_anchor: {
    title: "Unlock HD exports in seconds",
    subtitle: "Most gift buyers pick 3-pack or unlimited to avoid repeat checkout later.",
    singleCta: "Get 1 HD map",
    packCta: "Get 3 HD maps",
    subscriptionCta: "Go unlimited",
    badgeLabel: "Most flexible",
  },
};

export function PaywallModal({
  checkoutInFlight,
  checkoutError,
  priceLabels,
  printPriceLabels,
  variant,
  purchaseIntent = "digital",
  preferredPrintVariant = "poster_framed",
  showReferralHint = false,
  onStartCheckout,
  onStartPrintCheckout,
  onClose,
}: Props) {
  const copy = PAYWALL_COPY[variant];
  const hasPrintOptions = Boolean(onStartPrintCheckout && printPriceLabels);
  const [activeIntent, setActiveIntent] = useState<"digital" | "print">(
    hasPrintOptions && purchaseIntent === "print" ? "print" : "digital",
  );
  const preferredVariant = preferredPrintVariant === "poster_unframed" ? "poster_unframed" : "poster_framed";

  useEffect(() => {
    if (!hasPrintOptions) {
      setActiveIntent("digital");
      return;
    }
    setActiveIntent(purchaseIntent === "print" ? "print" : "digital");
  }, [hasPrintOptions, purchaseIntent]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-8">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-amber-200 bg-[rgba(247,241,227,0.95)] p-5 shadow-2xl shadow-black/25">
        <h3 className="text-lg font-semibold text-midnight">{copy.title}</h3>
        <p className="mt-2 text-xs text-neutral-700">
          {activeIntent === "print" && hasPrintOptions
            ? "Choose your print format. Most customers pick Framed + HD for gifting plus instant digital backup."
            : copy.subtitle}
        </p>
        <ul className="mt-3 space-y-1 text-xs text-neutral-700">
          <li>• 6000px high resolution (poster quality)</li>
          <li>• No watermark</li>
          <li>• Secure Stripe checkout</li>
          <li>{activeIntent === "print" ? "• Print order draft is created right after payment" : "• Instant digital download"}</li>
        </ul>

        {hasPrintOptions && (
          <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-amber-200/70 bg-white/70 p-1">
            <button
              type="button"
              onClick={() => setActiveIntent("digital")}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                activeIntent === "digital"
                  ? "bg-amber-400 text-midnight shadow-sm"
                  : "text-neutral-700 hover:bg-white/80"
              }`}
            >
              Digital HD
            </button>
            <button
              type="button"
              onClick={() => setActiveIntent("print")}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                activeIntent === "print"
                  ? "bg-[#0b1433] text-amber-100 shadow-sm"
                  : "text-neutral-700 hover:bg-white/80"
              }`}
            >
              Printed gift
            </button>
          </div>
        )}

        <div className="mt-4 grid gap-3 text-sm">
          {activeIntent === "print" && hasPrintOptions && printPriceLabels && onStartPrintCheckout && (
            <div className="rounded-xl border border-white/20 bg-[#0b1433] p-3 text-amber-50">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">Printed + framed checkout</p>
                <span className="rounded-full border border-amber-200/40 bg-amber-400/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
                  Ships to your door
                </span>
              </div>
              <p className="mt-1 text-xs text-amber-100/80">
                Your current map is attached automatically. Shipping address is collected in Stripe checkout.
              </p>
              <div className="mt-3 grid gap-2">
                <button
                  type="button"
                  onClick={() => onStartPrintCheckout({ variant: "poster_framed", includeDigitalAddOn: true })}
                  disabled={checkoutInFlight}
                  className="w-full rounded-full border border-amber-200/70 bg-amber-400/30 px-4 py-2 text-xs font-semibold text-amber-50 transition hover:-translate-y-[1px] hover:bg-amber-400/40 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Framed + HD file (recommended) • {printPriceLabels.framed} + {printPriceLabels.digitalAddOn}
                </button>
                <button
                  type="button"
                  onClick={() => onStartPrintCheckout({ variant: "poster_framed", includeDigitalAddOn: false })}
                  disabled={checkoutInFlight}
                  className={`w-full rounded-full border px-4 py-2 text-xs font-semibold transition hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-70 ${
                    preferredVariant === "poster_framed"
                      ? "border-amber-200/70 bg-amber-400/25 text-amber-50 hover:bg-amber-400/35"
                      : "border-white/20 bg-white/10 text-amber-50 hover:border-white/35 hover:bg-white/15"
                  }`}
                >
                  Framed print • {printPriceLabels.framed}
                </button>
                <button
                  type="button"
                  onClick={() => onStartPrintCheckout({ variant: "poster_unframed", includeDigitalAddOn: false })}
                  disabled={checkoutInFlight}
                  className={`w-full rounded-full border px-4 py-2 text-xs font-semibold transition hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-70 ${
                    preferredVariant === "poster_unframed"
                      ? "border-amber-200/70 bg-amber-400/25 text-amber-50 hover:bg-amber-400/35"
                      : "border-white/20 bg-white/10 text-amber-50 hover:border-white/35 hover:bg-white/15"
                  }`}
                >
                  Unframed poster • {printPriceLabels.unframed}
                </button>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-amber-200/70 bg-white/70 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-midnight">One HD export</p>
                <p className="text-xs text-neutral-600">1 print-ready download</p>
              </div>
              <div className="text-right text-sm font-semibold text-amber-800">
                <span>{priceLabels.single}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onStartCheckout("single")}
              disabled={checkoutInFlight}
              className="mt-3 w-full rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-2 text-sm font-semibold text-midnight shadow-md transition hover:-translate-y-[1px] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
            >
              {checkoutInFlight ? "Starting checkout..." : copy.singleCta}
            </button>
          </div>

          <div className="rounded-xl border border-amber-200/70 bg-white/70 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-midnight">3-pack</p>
                <p className="text-xs text-neutral-600">3 HD downloads</p>
              </div>
              <div className="text-right text-sm font-semibold text-amber-800">
                {priceLabels.pack3}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onStartCheckout("pack3")}
              disabled={checkoutInFlight}
              className="mt-3 w-full rounded-full border border-amber-200 bg-white/80 px-4 py-2 text-sm font-semibold text-midnight shadow-sm transition hover:-translate-y-[1px] hover:shadow disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
            >
              {copy.packCta}
            </button>
          </div>

          <div className="rounded-xl border border-amber-300 bg-amber-100/70 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-midnight">Unlimited monthly</p>
                  <span className="rounded-full bg-amber-300/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-midnight">
                    {copy.badgeLabel}
                  </span>
                </div>
                <p className="text-xs text-neutral-700">Unlimited HD exports • cancel anytime</p>
              </div>
              <div className="text-right text-sm font-semibold text-amber-900">
                {priceLabels.subscription}
                <span className="text-xs text-amber-900/70">/mo</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onStartCheckout("subscription")}
              disabled={checkoutInFlight}
              className="mt-3 w-full rounded-full bg-[#0b1433] px-4 py-2 text-sm font-semibold text-amber-100 shadow-md transition hover:-translate-y-[1px] hover:bg-[#0b1a40] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
            >
              {checkoutInFlight ? "Starting checkout..." : copy.subscriptionCta}
            </button>
          </div>

          {activeIntent !== "print" && onStartPrintCheckout && printPriceLabels && (
            <div className="rounded-xl border border-white/20 bg-[#0b1433] p-3 text-amber-50">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">Prefer a physical print?</p>
                <span className="rounded-full border border-amber-200/40 bg-amber-400/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
                  New
                </span>
              </div>
              <p className="mt-1 text-xs text-amber-100/80">
                Ships to your address. Add digital access now or later.
              </p>
              <div className="mt-3 grid gap-2">
                <button
                  type="button"
                  onClick={() => onStartPrintCheckout({ variant: "poster_framed", includeDigitalAddOn: true })}
                  disabled={checkoutInFlight}
                  className="w-full rounded-full border border-amber-200/60 bg-amber-400/25 px-4 py-2 text-xs font-semibold text-amber-50 transition hover:-translate-y-[1px] hover:bg-amber-400/35 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Framed + HD file • {printPriceLabels.framed} + {printPriceLabels.digitalAddOn}
                </button>
                <button
                  type="button"
                  onClick={() => onStartPrintCheckout({ variant: "poster_framed", includeDigitalAddOn: false })}
                  disabled={checkoutInFlight}
                  className="w-full rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-amber-50 transition hover:-translate-y-[1px] hover:border-white/35 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Framed print • {printPriceLabels.framed}
                </button>
                <button
                  type="button"
                  onClick={() => onStartPrintCheckout({ variant: "poster_unframed", includeDigitalAddOn: false })}
                  disabled={checkoutInFlight}
                  className="w-full rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-amber-50 transition hover:-translate-y-[1px] hover:border-white/35 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Unframed print • {printPriceLabels.unframed}
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-3 text-[11px] text-neutral-600">
          Secure checkout. Subscription can be canceled anytime. Need help? Email support@starmapco.com.
        </p>
        <p className="mt-2 text-xs font-semibold text-neutral-700">
          Have a promo code? It can be applied at checkout.
        </p>
        {showReferralHint && (
          <p className="mt-1 text-[11px] text-neutral-600">
            Referral offers apply automatically at checkout when available.
          </p>
        )}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-amber-200 bg-[rgba(247,241,227,0.95)] px-3 py-2 text-sm font-semibold text-neutral-700 shadow-sm transition hover:-translate-y-[1px] hover:shadow"
          >
            Cancel
          </button>
        </div>
        {checkoutError && <p className="mt-2 text-sm font-semibold text-rose-700">{checkoutError}</p>}
      </div>
    </div>
  );
}
