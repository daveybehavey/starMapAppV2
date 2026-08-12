import shippingMap from "../../data/printful-shipping.json";
import type { PrintVariant } from "@/lib/printCatalog";
import { getPrintShippingProfile } from "@/lib/printCatalog";
import { formatPrice } from "@/lib/pricing";

export type PrintfulShippingRate = {
  rate: number;
  currency: string;
  min_delivery_days?: number;
  max_delivery_days?: number;
};

export type PrintShippingEstimate = {
  amountCents: number;
  currency: string;
  minDeliveryDays?: number;
  maxDeliveryDays?: number;
};

type ShippingMap = {
  currency: string;
  countries: string[];
  poster_unframed: Record<string, PrintfulShippingRate>;
  poster_framed: Record<string, PrintfulShippingRate>;
};

const map = shippingMap as ShippingMap;

export const PRINT_SHIPPING_COUNTRY_KEY = "print-shipping-country";

const FALLBACK_COUNTRY_LABELS: Record<string, string> = {
  US: "United States",
  CA: "Canada",
  GB: "United Kingdom",
  IE: "Ireland",
  AU: "Australia",
  NZ: "New Zealand",
  DE: "Germany",
  FR: "France",
  ES: "Spain",
  IT: "Italy",
  NL: "Netherlands",
  BE: "Belgium",
  SE: "Sweden",
  NO: "Norway",
  DK: "Denmark",
  FI: "Finland",
  CH: "Switzerland",
  AT: "Austria",
  PT: "Portugal",
  PL: "Poland",
  CZ: "Czechia",
  HU: "Hungary",
  SK: "Slovakia",
  SI: "Slovenia",
  HR: "Croatia",
};

export function getPrintfulShippingCountries() {
  return Array.isArray(map?.countries) && map.countries.length ? map.countries : ["US"];
}

export function getPrintfulShippingRate(variant: PrintVariant, country: string) {
  const code = country.trim().toUpperCase();
  const profile = getPrintShippingProfile(variant);
  if (profile === "poster_framed") {
    return map.poster_framed?.[code] ?? null;
  }
  return map.poster_unframed?.[code] ?? null;
}

export function getPrintShippingEstimate(
  variant: PrintVariant,
  country: string | null | undefined,
): PrintShippingEstimate | null {
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

export function formatPrintDeliveryWindow(
  estimate: Pick<PrintShippingEstimate, "minDeliveryDays" | "maxDeliveryDays"> | null | undefined,
): string | null {
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

export function formatPrintDeliveryEstimate(
  variant: PrintVariant,
  country: string | null | undefined,
): string | null {
  return formatPrintDeliveryWindow(getPrintShippingEstimate(variant, country));
}

export function formatPrintShippingEstimate(
  variant: PrintVariant,
  country: string | null | undefined,
  fallback = "shipping",
) {
  const estimate = getPrintShippingEstimate(variant, country);
  if (!estimate) return fallback;
  return `${formatPrice(estimate.amountCents, estimate.currency)} shipping`;
}

export function formatPrintShippingEstimateWithDelivery(
  variant: PrintVariant,
  country: string | null | undefined,
  fallback = "shipping",
) {
  const shipping = formatPrintShippingEstimate(variant, country, fallback);
  const delivery = formatPrintDeliveryEstimate(variant, country);
  if (delivery) return `${shipping} · ${delivery} transit`;
  return shipping;
}

/** Country-unknown / pre-destination transit copy — never invent a US window. */
export const PRINT_NEUTRAL_TRANSIT_DISCLOSURE =
  "Carrier transit varies by destination and is shown after you select a shipping country" as const;

/** Compact card/note when shipping price + transit are not yet destination-specific. */
export const PRINT_NEUTRAL_SHIPPING_CARD_NOTE =
  "Shipping cost and destination-specific transit are shown after you select a shipping country." as const;

/** Explicit empty option label for unset shipping-country selects (never invent first/US). */
export const PRINT_SHIPPING_COUNTRY_PLACEHOLDER_LABEL = "Select shipping country" as const;

/**
 * Customer-facing transit disclosure.
 * Known supported country → matrix-backed country-labelled window.
 * Unknown / unsupported → factual neutral copy (never defaults to United States).
 */
export function formatPrintDeliveryDisclosure(
  variant: PrintVariant,
  country: string | null | undefined,
): string {
  const delivery = formatPrintDeliveryEstimate(variant, country);
  if (!delivery || !country) return PRINT_NEUTRAL_TRANSIT_DISCLOSURE;
  return `Typical transit to ${getPrintShippingCountryLabel(country)}: ${delivery} after fulfillment`;
}

export function readStoredPrintShippingCountry() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PRINT_SHIPPING_COUNTRY_KEY);
    return raw ? raw.trim().toUpperCase() : null;
  } catch {
    return null;
  }
}

/**
 * Restore a previously chosen destination, or keep unset.
 * Never invents the first allowed country (US) for first-time visitors.
 */
export function resolveInitialPrintShippingCountry(
  stored: string | null | undefined,
  allowedCountries: readonly string[],
): string | null {
  if (!stored) return null;
  const normalized = stored.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return null;
  if (!allowedCountries.includes(normalized)) return null;
  return normalized;
}

export function storePrintShippingCountry(country: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PRINT_SHIPPING_COUNTRY_KEY, country.trim().toUpperCase());
  } catch {
    // ignore storage errors
  }
}

export function getPrintShippingCountryLabel(countryCode: string) {
  const code = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return countryCode;

  let label = FALLBACK_COUNTRY_LABELS[code] ?? code;
  if (typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function") {
    try {
      const display = new Intl.DisplayNames(["en"], { type: "region" }).of(code);
      if (display) label = display;
    } catch {
      // ignore Intl failures
    }
  }
  return label;
}

export function getPrintShippingCountryOptions(countries: string[]) {
  return countries.map((code) => ({
    code,
    label: getPrintShippingCountryLabel(code),
  }));
}
