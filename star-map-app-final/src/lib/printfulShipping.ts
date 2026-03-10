import shippingMap from "../../data/printful-shipping.json";

export type PrintfulShippingRate = {
  rate: number;
  currency: string;
  min_delivery_days?: number;
  max_delivery_days?: number;
};

type ShippingMap = {
  currency: string;
  countries: string[];
  poster_unframed: Record<string, PrintfulShippingRate>;
  poster_framed: Record<string, PrintfulShippingRate>;
};

const map = shippingMap as ShippingMap;

export const PRINT_SHIPPING_COUNTRY_KEY = "print-shipping-country";

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
