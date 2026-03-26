import shippingMap from "../../data/printful-shipping.json";
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

export function getPrintfulShippingRate(variant: "poster_unframed" | "poster_framed", country: string) {
  const code = country.trim().toUpperCase();
  if (variant === "poster_framed") {
    return map.poster_framed?.[code] ?? null;
  }
  return map.poster_unframed?.[code] ?? null;
}

export function getPrintShippingEstimate(
  variant: "poster_unframed" | "poster_framed",
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

export function formatPrintShippingEstimate(
  variant: "poster_unframed" | "poster_framed",
  country: string | null | undefined,
  fallback = "shipping",
) {
  const estimate = getPrintShippingEstimate(variant, country);
  if (!estimate) return fallback;
  return `${formatPrice(estimate.amountCents, estimate.currency)} shipping`;
}

export function formatPrintDeliveryEstimate(
  variant: "poster_unframed" | "poster_framed",
  country: string | null | undefined,
  fallback = "delivery shown in checkout",
) {
  const estimate = getPrintShippingEstimate(variant, country);
  if (!estimate) return fallback;
  const minDays = estimate.minDeliveryDays;
  const maxDays = estimate.maxDeliveryDays;
  if (typeof minDays === "number" && typeof maxDays === "number") {
    if (minDays <= 0 || maxDays <= 0) return fallback;
    if (minDays === maxDays) return `${minDays} business day${minDays === 1 ? "" : "s"}`;
    return `${minDays}-${maxDays} business days`;
  }
  if (typeof maxDays === "number" && maxDays > 0) {
    return `up to ${maxDays} business days`;
  }
  if (typeof minDays === "number" && minDays > 0) {
    return `${minDays}+ business days`;
  }
  return fallback;
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
      if (display && display.trim()) label = display;
    } catch {
      // fallback label remains in use
    }
  }

  return label === code ? code : `${label} (${code})`;
}

export function getPrintShippingCountryOptions(countries: string[]) {
  return countries.map((code) => ({
    code,
    label: getPrintShippingCountryLabel(code),
  }));
}
