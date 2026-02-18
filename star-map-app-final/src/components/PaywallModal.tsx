"use client";

import type { CheckoutPlan } from "@/lib/pricing";
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
  variant: PaywallCopyVariant;
  onStartCheckout: (plan: CheckoutPlan) => void;
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
  variant,
  onStartCheckout,
  onClose,
}: Props) {
  const copy = PAYWALL_COPY[variant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-8">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-amber-200 bg-[rgba(247,241,227,0.95)] p-5 shadow-2xl shadow-black/25">
        <h3 className="text-lg font-semibold text-midnight">{copy.title}</h3>
        <p className="mt-2 text-xs text-neutral-700">{copy.subtitle}</p>
        <ul className="mt-3 space-y-1 text-xs text-neutral-700">
          <li>• 6000px high resolution (poster quality)</li>
          <li>• No watermark</li>
          <li>• Secure Stripe checkout</li>
          <li>• Instant digital download</li>
        </ul>

        <div className="mt-4 grid gap-3 text-sm">
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
        </div>

        <p className="mt-3 text-[11px] text-neutral-600">
          Secure checkout. Subscription can be canceled anytime. Need help? Email support@starmapco.com.
        </p>
        <p className="mt-2 text-xs font-semibold text-neutral-700">
          Have a promo code? It can be applied at checkout.
        </p>
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
