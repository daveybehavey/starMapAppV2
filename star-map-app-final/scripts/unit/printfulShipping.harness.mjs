/**
 * Keep in sync with src/lib/printfulShipping.ts disclosure helpers (matrix-backed).
 * Loads the same Printful shipping JSON used by the app.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const shippingMap = JSON.parse(readFileSync(join(root, "data/printful-shipping.json"), "utf8"));

export const PRINT_NEUTRAL_TRANSIT_DISCLOSURE =
  "Carrier transit varies by destination and is shown after you select a shipping country";

export const PRINT_NEUTRAL_SHIPPING_CARD_NOTE =
  "Shipping cost and destination-specific transit are shown after you select a shipping country.";

const FALLBACK_COUNTRY_LABELS = {
  US: "United States",
  CA: "Canada",
  GB: "United Kingdom",
  AU: "Australia",
};

function getPrintShippingProfile(variant) {
  if (variant === "poster_framed") return "poster_framed";
  return "poster_unframed";
}

export function getPrintfulShippingRate(variant, country) {
  const code = String(country || "")
    .trim()
    .toUpperCase();
  const profile = getPrintShippingProfile(variant);
  if (profile === "poster_framed") {
    return shippingMap.poster_framed?.[code] ?? null;
  }
  return shippingMap.poster_unframed?.[code] ?? null;
}

export function getPrintShippingEstimate(variant, country) {
  if (!country) return null;
  const rate = getPrintfulShippingRate(variant, country);
  if (!rate || !Number.isFinite(rate.rate)) return null;
  return {
    amountCents: Math.round(rate.rate * 100),
    currency: (rate.currency || "USD").toUpperCase(),
    minDeliveryDays: typeof rate.min_delivery_days === "number" ? rate.min_delivery_days : undefined,
    maxDeliveryDays: typeof rate.max_delivery_days === "number" ? rate.max_delivery_days : undefined,
  };
}

export function formatPrintDeliveryWindow(estimate) {
  if (!estimate) return null;
  const { minDeliveryDays: min, maxDeliveryDays: max } = estimate;
  if (typeof min === "number" && typeof max === "number") {
    if (min === max) return `${min} business day${min === 1 ? "" : "s"}`;
    return `${min}–${max} business days`;
  }
  if (typeof min === "number") return `${min}+ business days`;
  if (typeof max === "number") return `up to ${max} business days`;
  return null;
}

export function formatPrintDeliveryEstimate(variant, country) {
  return formatPrintDeliveryWindow(getPrintShippingEstimate(variant, country));
}

export function getPrintShippingCountryLabel(countryCode) {
  const code = String(countryCode || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return countryCode;
  let label = FALLBACK_COUNTRY_LABELS[code] ?? code;
  if (typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function") {
    try {
      const display = new Intl.DisplayNames(["en"], { type: "region" }).of(code);
      if (display) label = display;
    } catch {
      // ignore
    }
  }
  return label;
}

export function formatPrintDeliveryDisclosure(variant, country) {
  const delivery = formatPrintDeliveryEstimate(variant, country);
  if (!delivery || !country) return PRINT_NEUTRAL_TRANSIT_DISCLOSURE;
  return `Typical transit to ${getPrintShippingCountryLabel(country)}: ${delivery} after fulfillment`;
}

/** Mirrors printGiftDecisionCopy.getPrintDeliveryEtaLine */
export function getPrintDeliveryEtaLine(printShippingCountry, variant = "poster_framed") {
  if (!printShippingCountry) return null;
  return formatPrintDeliveryDisclosure(variant, printShippingCountry);
}
