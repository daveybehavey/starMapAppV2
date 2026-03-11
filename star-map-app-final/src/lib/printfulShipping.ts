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
