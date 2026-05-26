"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CheckoutPlan } from "@/lib/pricing";
import type { PrintVariant } from "@/lib/pricing";
import type { PaywallCopyVariant } from "@/lib/experiments";
import { trackSelectItem, trackViewItemList } from "@/lib/analytics";
import { getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";
import { getPrintShippingCountryLabel, getPrintShippingCountryOptions } from "@/lib/printfulShipping";
import { PAYWALL_PRINT_CHECKOUT_ROWS } from "@/lib/printCatalog";
import {
  formatPosterShippingFootnote,
  getPaywallPrintCheckoutPresentation,
  isPreferredPaywallPrintRow,
  type PaywallPrintCheckoutPresentationRow,
} from "@/lib/paywallPrintCheckout";

type PriceLabels = {
  single: string;
  pack3: string;
  subscription: string;
};

function paywallPrintSkuButtonClasses(row: PaywallPrintCheckoutPresentationRow, preferredPrintVariant: PrintVariant) {
  const shared =
    "w-full rounded-full border px-4 py-2 text-xs font-semibold transition hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-70";

  if (row.recommended) {
    return `${shared} border-amber-200/70 bg-amber-400/30 text-amber-50 hover:bg-amber-400/40`;
  }
  if (isPreferredPaywallPrintRow(row, preferredPrintVariant)) {
    return `${shared} border-amber-200/70 bg-amber-400/25 text-amber-50 hover:bg-amber-400/35`;
  }

  return `${shared} border-white/20 bg-white/10 text-amber-50 hover:border-white/35 hover:bg-white/15`;
}

type Props = {
  checkoutInFlight: boolean;
  checkoutError: string | null;
  priceLabels: PriceLabels;
  printShippingCountry?: string | null;
  printShippingCountries?: string[];
  onPrintShippingCountryChange?: (country: string) => void;
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
    title: "Buy this map in HD or print",
    subtitle: "You already built this map. Start with one-time HD, or choose a printed gift checkout.",
    singleCta: "Buy this map in HD",
    packCta: "Buy 3 HD exports",
    subscriptionCta: "Start unlimited",
    badgeLabel: "Repeat use",
  },
  value_anchor: {
    title: "Buy this map in HD",
    subtitle: "Most first-time buyers only need one HD export. Use packs or unlimited if you plan to create more maps.",
    singleCta: "Buy this map in HD",
    packCta: "Buy 3 HD exports",
    subscriptionCta: "Start unlimited",
    badgeLabel: "Repeat use",
  },
};

export function PaywallModal({
  checkoutInFlight,
  checkoutError,
  priceLabels,
  variant,
  purchaseIntent = "digital",
  preferredPrintVariant = "poster_framed",
  printShippingCountry,
  printShippingCountries = [],
  onPrintShippingCountryChange,
  showReferralHint = false,
  onStartCheckout,
  onStartPrintCheckout,
  onClose,
}: Props) {
  const copy = PAYWALL_COPY[variant];
  const hasPrintOptions = Boolean(onStartPrintCheckout);
  const [activeIntent, setActiveIntent] = useState<"digital" | "print">(
    hasPrintOptions && purchaseIntent === "print" ? "print" : "digital",
  );
  const [printUpsellHint, setPrintUpsellHint] = useState<string | null>(null);
  const shippingDisclosure = getPrintShippingDisclosure();
  const viewedListsRef = useRef<Set<string>>(new Set());
  const printShippingCountryOptions = useMemo(
    () => getPrintShippingCountryOptions(printShippingCountries),
    [printShippingCountries],
  );
  const printRows = useMemo(() => getPaywallPrintCheckoutPresentation(printShippingCountry), [printShippingCountry]);

  const posterShippingFootnote = useMemo(
    () => formatPosterShippingFootnote(printShippingCountry),
    [printShippingCountry],
  );

  const canPrintCheckout = Boolean(printShippingCountry);

  useEffect(() => {
    if (!hasPrintOptions) {
      setActiveIntent("digital");
      return;
    }
    setActiveIntent(purchaseIntent === "print" ? "print" : "digital");
  }, [hasPrintOptions, purchaseIntent]);

  useEffect(() => {
    if (printShippingCountry) {
      setPrintUpsellHint(null);
    }
  }, [printShippingCountry]);

  useEffect(() => {
    if (!viewedListsRef.current.has("paywall_digital_options")) {
      trackViewItemList({
        itemListId: "paywall_digital_options",
        itemListName: "Paywall digital options",
        items: [
          { plan: "single", orderType: "digital", index: 0 },
          { plan: "pack3", orderType: "digital", index: 1 },
          { plan: "subscription", orderType: "digital", index: 2 },
        ],
      });
      viewedListsRef.current.add("paywall_digital_options");
    }

    if (!hasPrintOptions) return;

    const listId = activeIntent === "print" ? "paywall_print_options" : "paywall_print_upsell";
    if (viewedListsRef.current.has(listId)) return;

    trackViewItemList({
      itemListId: listId,
      itemListName: activeIntent === "print" ? "Paywall print options" : "Paywall print upsell",
      items: PAYWALL_PRINT_CHECKOUT_ROWS.map((row, index) => ({
        plan: "single",
        orderType: "print" as const,
        printVariant: row.variant,
        includeDigitalAddOn: row.includeDigitalAddOn,
        index,
      })),
    });
    viewedListsRef.current.add(listId);
  }, [activeIntent, hasPrintOptions]);

  const handleDigitalCheckoutClick = (plan: CheckoutPlan) => {
    trackSelectItem({
      itemListId: "paywall_digital_options",
      itemListName: "Paywall digital options",
      item: {
        plan,
        orderType: "digital",
        index: plan === "single" ? 0 : plan === "pack3" ? 1 : 2,
      },
    });
    onStartCheckout(plan);
  };

  const handlePrintCheckoutClick = (
    row: PaywallPrintCheckoutPresentationRow,
    listId: "paywall_print_options" | "paywall_print_upsell",
  ) => {
    setPrintUpsellHint(null);
    trackSelectItem({
      itemListId: listId,
      itemListName: listId === "paywall_print_options" ? "Paywall print options" : "Paywall print upsell",
      item: {
        plan: "single",
        orderType: "print",
        printVariant: row.variant,
        includeDigitalAddOn: row.includeDigitalAddOn,
        index: row.index,
      },
    });
    onStartPrintCheckout?.({ variant: row.variant, includeDigitalAddOn: row.includeDigitalAddOn });
  };

  const handlePrintUpsellClick = (row: PaywallPrintCheckoutPresentationRow) => {
    if (!canPrintCheckout) {
      setActiveIntent("print");
      setPrintUpsellHint("Select your shipping country first so we can show the correct print checkout.");
      return;
    }
    handlePrintCheckoutClick(row, "paywall_print_upsell");
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="paywall-dialog-title"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-amber-200 bg-[rgba(247,241,227,0.95)] p-5 shadow-2xl shadow-black/25"
      >
        <h3 id="paywall-dialog-title" className="text-lg font-semibold text-midnight">
          {copy.title}
        </h3>
        <p className="mt-2 text-xs text-neutral-700">
          {activeIntent === "print" && hasPrintOptions
            ? "Choose your gift format — framed posters remain our most popular; canvas, mugs, and cards ship from the same print partner."
            : copy.subtitle}
        </p>
        <ul className="mt-3 space-y-1 text-xs text-neutral-700">
          <li>• 6000px high resolution (poster quality)</li>
          <li>• No watermark</li>
          <li>• Secure checkout with card, Apple Pay, Google Pay, and Link on supported devices</li>
          <li>{activeIntent === "print" ? "• Print order draft is created right after payment" : "• Instant digital download"}</li>
        </ul>
        {activeIntent === "digital" && (
          <p className="mt-3 rounded-xl border border-amber-200/70 bg-white/70 px-3 py-2 text-[11px] font-medium text-neutral-700">
            Just need this one map? The one-time HD option is enough. Packs and unlimited only make sense for repeat exports.
          </p>
        )}

        {hasPrintOptions && (
          <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-amber-200/70 bg-white/70 p-1">
            {(purchaseIntent === "print"
              ? (
                  [
                    { id: "print" as const, label: "Printed gift" },
                    { id: "digital" as const, label: "Digital HD" },
                  ]
                )
              : (
                  [
                    { id: "digital" as const, label: "Digital HD" },
                    { id: "print" as const, label: "Printed gift" },
                  ]
                )
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveIntent(tab.id)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  activeIntent === tab.id
                    ? tab.id === "print"
                      ? "bg-[#0b1433] text-amber-100 shadow-sm"
                      : "bg-amber-400 text-midnight shadow-sm"
                    : "text-neutral-700 hover:bg-white/80"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 grid gap-3 text-sm">
          {activeIntent === "print" && hasPrintOptions && onStartPrintCheckout && (
            <div className="rounded-xl border border-white/20 bg-[#0b1433] p-3 text-amber-50">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">Physical gifts checkout</p>
                <span className="rounded-full border border-amber-200/40 bg-amber-400/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
                  Physical delivery
                </span>
              </div>
              <p className="mt-1 text-xs text-amber-100/80">
                Your current map is attached automatically. Shipping is shown in Stripe checkout and the order is
                created for manual review. {shippingDisclosure}
              </p>
              {printShippingCountries.length > 0 && (
                <div className="mt-3">
                  <label htmlFor="paywall-print-country" className="text-[11px] font-semibold text-amber-100/80">
                    Shipping country
                  </label>
                  <select
                    id="paywall-print-country"
                    value={printShippingCountry ?? ""}
                    onChange={(event) => onPrintShippingCountryChange?.(event.target.value)}
                    className="print-country-select mt-1 w-full rounded-lg border border-amber-200/50 bg-white px-3 py-2 text-xs text-midnight"
                    style={{ color: "#111827", WebkitTextFillColor: "#111827", colorScheme: "light" }}
                  >
                    {printShippingCountryOptions.map((country) => (
                      <option
                        key={country.code}
                        value={country.code}
                        className="text-midnight"
                        style={{ color: "#111827", backgroundColor: "#ffffff" }}
                      >
                        {country.label}
                      </option>
                    ))}
                  </select>
                  {!canPrintCheckout && (
                    <p className="mt-1 text-[10px] text-amber-100/80">Select a shipping country to continue.</p>
                  )}
                  {printShippingCountry && posterShippingFootnote ? (
                    <p className="mt-1 text-[10px] text-amber-100/80">
                      Estimated shipping to {getPrintShippingCountryLabel(printShippingCountry)}: {posterShippingFootnote}
                    </p>
                  ) : null}
                </div>
              )}
              {printUpsellHint ? (
                <p className="mt-2 rounded-lg border border-amber-200/25 bg-white/10 px-3 py-2 text-[11px] text-amber-100">
                  {printUpsellHint}
                </p>
              ) : null}
              <div className="mt-3 grid gap-2">
                {printRows.map((row) => (
                  <button
                    key={`${row.variant}-${row.includeDigitalAddOn ? "hd" : "print"}`}
                    type="button"
                    onClick={() => handlePrintCheckoutClick(row, "paywall_print_options")}
                    disabled={checkoutInFlight || !canPrintCheckout}
                    className={paywallPrintSkuButtonClasses(row, preferredPrintVariant)}
                  >
                    {checkoutInFlight ? (
                      "Opening secure checkout..."
                    ) : (
                      <>
                        <span className="block font-semibold">{row.headline}</span>
                        <span className="mt-0.5 block text-[10px] font-normal text-amber-100/95">{row.secondaryLine}</span>
                      </>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-amber-200/70 bg-white/70 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-midnight">One HD export</p>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                    One-time
                  </span>
                </div>
                <p className="text-xs text-neutral-600">1 print-ready download for this map • no subscription</p>
              </div>
              <div className="text-right text-sm font-semibold text-amber-800">
                <span>{priceLabels.single}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleDigitalCheckoutClick("single")}
              disabled={checkoutInFlight}
              className="mt-3 w-full rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-2 text-sm font-semibold text-midnight shadow-md transition hover:-translate-y-[1px] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
            >
              {checkoutInFlight ? "Starting checkout..." : copy.singleCta}
            </button>
            <p className="mt-2 text-[11px] text-neutral-600">Most buyers who only need this map start here.</p>
          </div>

          <div className="rounded-xl border border-amber-200/70 bg-white/70 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-midnight">3-credit pack</p>
                <p className="text-xs text-neutral-600">Use when you plan to make more maps, revisions, or gifts</p>
              </div>
              <div className="text-right text-sm font-semibold text-amber-800">{priceLabels.pack3}</div>
            </div>
            <button
              type="button"
              onClick={() => handleDigitalCheckoutClick("pack3")}
              disabled={checkoutInFlight}
              className="mt-3 w-full rounded-full border border-amber-200 bg-white/80 px-4 py-2 text-sm font-semibold text-midnight shadow-sm transition hover:-translate-y-[1px] hover:shadow disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
            >
              {copy.packCta}
            </button>
            <p className="mt-2 text-[11px] text-neutral-600">Each HD export uses one credit from this pack.</p>
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
                <p className="text-xs text-neutral-700">Unlimited HD exports for ongoing use • cancel anytime</p>
              </div>
              <div className="text-right text-sm font-semibold text-amber-900">
                {priceLabels.subscription}
                <span className="text-xs text-amber-900/70">/mo</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleDigitalCheckoutClick("subscription")}
              disabled={checkoutInFlight}
              className="mt-3 w-full rounded-full bg-[#0b1433] px-4 py-2 text-sm font-semibold text-amber-100 shadow-md transition hover:-translate-y-[1px] hover:bg-[#0b1a40] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
            >
              {checkoutInFlight ? "Starting checkout..." : copy.subscriptionCta}
            </button>
          </div>

          {activeIntent !== "print" && onStartPrintCheckout && (
            <div className="rounded-xl border border-white/20 bg-[#0b1433] p-3 text-amber-50">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">Prefer a physical print?</p>
                <span className="rounded-full border border-amber-200/40 bg-amber-400/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
                  Gifts
                </span>
              </div>
              <p className="mt-1 text-xs text-amber-100/80">Ships to your address. Add digital access now or later.</p>
              {!canPrintCheckout && (
                <p className="mt-2 rounded-lg border border-amber-200/25 bg-white/10 px-3 py-2 text-[11px] text-amber-100">
                  Choose your shipping country on the print tab first so checkout uses the correct route and shipping price.
                </p>
              )}
              <div className="mt-3 grid gap-2">
                {printRows.map((row) => (
                  <button
                    key={`upsell-${row.variant}-${row.includeDigitalAddOn ? "hd" : "print"}`}
                    type="button"
                    onClick={() => handlePrintUpsellClick(row)}
                    disabled={checkoutInFlight}
                    className={paywallPrintSkuButtonClasses(row, preferredPrintVariant)}
                  >
                    {checkoutInFlight ? (
                      "Opening secure checkout..."
                    ) : (
                      <>
                        <span className="block font-semibold">{row.headline}</span>
                        <span className="mt-0.5 block text-[10px] font-normal text-amber-100/95">
                          {canPrintCheckout ? row.secondaryLine : "Open print tab to finish"}
                        </span>
                      </>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="mt-3 text-[11px] text-neutral-600">
          Secure checkout with card, Apple Pay, Google Pay, and Link on supported devices. Subscription can be canceled anytime. Need help? Email support@starmapco.com.
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
            aria-label="Close purchase options"
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
