import type { PaywallPrintCheckoutRow } from "@/lib/printCatalog";
import type { PrintVariant } from "@/lib/printCatalog";
import { PAYWALL_PRINT_CHECKOUT_ROWS } from "@/lib/printCatalog";
import { formatPrice, getPrintDigitalAddOnPrice, getPrintPricingTiers } from "@/lib/pricing";
import { formatPrintShippingEstimate } from "@/lib/printfulShipping";

export type PaywallPrintCheckoutPresentationRow = PaywallPrintCheckoutRow & {
  index: number;
  headline: string;
  secondaryLine: string;
};

export function getPaywallPrintCheckoutPresentation(
  printShippingCountry: string | null | undefined,
): PaywallPrintCheckoutPresentationRow[] {
  const tiers = getPrintPricingTiers();
  const addon = getPrintDigitalAddOnPrice();
  const digitalAddonLabel = formatPrice(addon.amountCents, addon.currency);

  return PAYWALL_PRINT_CHECKOUT_ROWS.map((row, index) => {
    const tier = tiers[row.variant];
    const headline = row.headline ?? tier.label;
    const productPrice = formatPrice(tier.amountCents, tier.currency);
    const shippingLabel = formatPrintShippingEstimate(row.variant, printShippingCountry ?? null, "shipping");
    const secondaryLine = row.includeDigitalAddOn
      ? `${productPrice} + ${shippingLabel} + ${digitalAddonLabel}`
      : `${productPrice} + ${shippingLabel}`;
    return { ...row, index, headline, secondaryLine };
  });
}

export function paywallPrintCheckoutRowsMatch(
  a: Pick<PaywallPrintCheckoutRow, "variant" | "includeDigitalAddOn">,
  b: Pick<PaywallPrintCheckoutRow, "variant" | "includeDigitalAddOn">,
): boolean {
  return a.variant === b.variant && a.includeDigitalAddOn === b.includeDigitalAddOn;
}

export function isPreferredPaywallPrintRow(
  row: Pick<PaywallPrintCheckoutRow, "variant" | "includeDigitalAddOn">,
  preferredPrintVariant: PrintVariant,
): boolean {
  if (row.includeDigitalAddOn) {
    return preferredPrintVariant === "poster_framed";
  }
  return row.variant === preferredPrintVariant;
}

export function formatPosterShippingFootnote(printShippingCountry: string | null | undefined): string | null {
  if (!printShippingCountry) return null;
  const framed = formatPrintShippingEstimate("poster_framed", printShippingCountry);
  const unframed = formatPrintShippingEstimate("poster_unframed", printShippingCountry);
  return `Poster tiers — framed ${framed}, unframed ${unframed}.`;
}

/** Desktop editor print panel — multi-column grid */
export function paywallPrintSkuButtonClassesEditorPanel(
  row: PaywallPrintCheckoutPresentationRow,
  preferredPrintVariant: PrintVariant,
) {
  const shared =
    "focus:ring-gold inline-flex min-h-[3.25rem] flex-col items-center justify-center rounded-full border px-3 py-2 text-xs font-semibold transition hover:-translate-y-[1px] focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-70";

  if (row.recommended) {
    return `${shared} border-amber-200/70 bg-amber-300/35 text-amber-50 hover:bg-amber-300/45`;
  }
  if (isPreferredPaywallPrintRow(row, preferredPrintVariant)) {
    return `${shared} border-amber-300/60 bg-amber-200/20 text-amber-100 hover:bg-amber-200/30`;
  }

  return `${shared} border-amber-300/60 bg-amber-100/20 text-amber-100 hover:bg-amber-100/30`;
}

/** Mobile preview strip */
export function paywallPrintSkuButtonClassesMobile(row: PaywallPrintCheckoutPresentationRow, preferredPrintVariant: PrintVariant) {
  const shared =
    "inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold shadow-sm transition hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-70";

  if (row.recommended) {
    return `${shared} border-amber-200/70 bg-amber-300/36 text-amber-50 hover:bg-amber-300/46`;
  }
  if (isPreferredPaywallPrintRow(row, preferredPrintVariant)) {
    return `${shared} border-amber-300/50 bg-amber-300/20 text-amber-100 hover:bg-amber-300/30`;
  }

  return `${shared} border-amber-300/50 bg-amber-100/20 text-amber-100 hover:bg-amber-100/30`;
}
