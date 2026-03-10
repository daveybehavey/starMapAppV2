import { formatPrice } from "@/lib/pricing";
import { getPrintfulShippingCountries } from "@/lib/printfulShipping";

function parseCountries(raw: string | undefined) {
  const parsed = String(raw ?? "")
    .split(",")
    .map((token) => token.trim().toUpperCase())
    .filter((token) => /^[A-Z]{2}$/.test(token));
  return parsed.length ? parsed : ["US"];
}

export function getPrintAllowedCountries() {
  const raw =
    typeof window === "undefined"
      ? process.env.PRINT_ALLOWED_COUNTRIES ?? process.env.NEXT_PUBLIC_PRINT_ALLOWED_COUNTRIES ?? "US"
      : process.env.NEXT_PUBLIC_PRINT_ALLOWED_COUNTRIES ?? "US";
  const parsed = parseCountries(raw);
  if (parsed.length === 1 && parsed[0] === "US") {
    return getPrintfulShippingCountries();
  }
  return parsed;
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

export function getPrintShippingDisclosure() {
  const audience = getPrintShippingCountryLabel();
  if (audience === "U.S.") return "U.S. shipping is added at checkout for physical orders.";
  return `Shipping is added at checkout for physical orders in ${audience}.`;
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
