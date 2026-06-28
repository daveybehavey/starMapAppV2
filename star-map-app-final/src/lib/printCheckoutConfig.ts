import { formatPrice, getPrintPricingTiers } from "@/lib/pricing";
import type { PrintVariant } from "@/lib/printCatalog";
import {
  getPrintFreeShippingOfferLine,
  getPrintMerchandiseSubtotalCents,
  qualifiesForPrintFreeShipping,
} from "@/lib/printFreeShipping";
import { getPrintfulShippingCountries } from "@/lib/printfulShipping";

function parseCountries(raw: string | undefined) {
  const parsed = String(raw ?? "")
    .split(",")
    .map((token) => token.trim().toUpperCase())
    .filter((token) => /^[A-Z]{2}$/.test(token));
  return parsed;
}

export function getPrintAllowedCountries() {
  const raw =
    typeof window === "undefined"
      ? process.env.PRINT_ALLOWED_COUNTRIES ?? process.env.NEXT_PUBLIC_PRINT_ALLOWED_COUNTRIES
      : process.env.NEXT_PUBLIC_PRINT_ALLOWED_COUNTRIES;
  if (!raw || !raw.trim()) {
    return getPrintfulShippingCountries();
  }
  const parsed = parseCountries(raw);
  return parsed.length ? parsed : ["US"];
}

export function isUsOnlyPrintCheckout() {
  const countries = getPrintAllowedCountries();
  return countries.length === 1 && countries[0] === "US";
}

export function getPrintShippingCountryLabel() {
  const countries = getPrintAllowedCountries();
  if (countries.length === 1 && countries[0] === "US") return "U.S.";
  if (countries.length === 2 && countries.includes("US") && countries.includes("CA")) return "the U.S. and Canada";
  if (countries.length === 1) return countries[0];
  if (countries.length > 3) return "selected countries";
  return countries.join(", ");
}

export function isPrintfulAutoConfirmEnabled() {
  const raw = (
    process.env.PRINTFUL_AUTO_CONFIRM ??
    process.env.NEXT_PUBLIC_PRINTFUL_AUTO_CONFIRM ??
    "true"
  ).trim();
  return /^(1|true|yes)$/i.test(raw);
}

/** Honest production copy — matches `PRINTFUL_AUTO_CONFIRM` in wrangler.toml. */
export function getPrintProductionReviewDisclosure() {
  return isPrintfulAutoConfirmEnabled()
    ? "Production begins after payment once your order is submitted to our print partner."
    : "Physical orders are reviewed before production while manual approval mode is enabled.";
}

/** Short trust bullet for money pages and purchase panels. */
export function getPrintProductionReviewTrustPoint() {
  return isPrintfulAutoConfirmEnabled()
    ? "Production begins after payment once the order is submitted for fulfillment."
    : "Physical orders stay in manual review before production starts.";
}

/** Delivery timeline bullet when print checkout is enabled. */
export function getPrintAddOnTimelinePoint() {
  return isPrintfulAutoConfirmEnabled()
    ? "If you add print, the physical order is submitted for fulfillment after payment."
    : "If you add print, the physical order is created for manual review before production starts.";
}

export function getPrintShippingDisclosure() {
  const freeShippingLine = getPrintFreeShippingOfferLine();
  const audience = getPrintShippingCountryLabel();
  const base =
    audience === "U.S."
      ? "U.S. shipping is added at checkout for physical orders below the free-shipping threshold."
      : `Shipping is added at checkout for physical orders in ${audience} below the free-shipping threshold.`;
  if (!freeShippingLine) {
    if (audience === "U.S.") return "U.S. shipping is added at checkout for physical orders.";
    return `Shipping is added at checkout for physical orders in ${audience}.`;
  }
  return `${freeShippingLine} ${base}`;
}

export function getPrintAvailabilityBadgeLabel() {
  return isUsOnlyPrintCheckout() ? "Printed + framed shipping in the U.S." : "Printed + framed available";
}

export function formatPrintPriceWithShipping(amountCents: number, currency: string) {
  return `${formatPrice(amountCents, currency)} + shipping`;
}

export function formatPrintPriceLabel(baseLabel: string) {
  return `${baseLabel} + shipping`;
}

export function buildPrintEditorCheckoutHref(input: {
  source: string;
  variant: PrintVariant;
  includeDigitalAddOn?: boolean;
  includeCardAddOn?: boolean;
  mode?: string;
}): string {
  const params = new URLSearchParams({
    mode: input.mode ?? "quick",
    source: input.source,
    checkout: "print",
    print_variant: input.variant,
  });
  if (input.includeDigitalAddOn) params.set("include_digital_addon", "1");
  if (input.includeCardAddOn) params.set("include_card_addon", "1");
  return `/editor?${params.toString()}`;
}

export function getFramedHdBundlePriceLine(): string {
  const tiers = getPrintPricingTiers();
  const currency = tiers.poster_framed.currency;
  const subtotal = getPrintMerchandiseSubtotalCents({
    variant: "poster_framed",
    includeDigitalAddOn: true,
  });
  const total = formatPrice(subtotal, currency);
  if (qualifiesForPrintFreeShipping(subtotal)) {
    return `${total} framed + HD · free shipping`;
  }
  return `${total} framed + HD digital`;
}

export { getPrintFreeShippingOfferLine } from "@/lib/printFreeShipping";
