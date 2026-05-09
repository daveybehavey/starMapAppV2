import type { PrintVariant } from "@/lib/printCatalog";
import { PRINT_CATALOG, getPrintCatalogRow } from "@/lib/printCatalog";

type PricingEnv = {
  basePriceCents: number;
  pack3PriceCents: number;
  subscriptionPriceCents: number;
  currency: string;
};

export type PricingInfo = {
  currency: string;
  baseAmountCents: number;
  activeAmountCents: number;
  promoAmountCents: number | null;
  promoActive: boolean;
  promoStart: Date | null;
  promoEnd: Date | null;
  promotionCodeId: string | null;
};

export type CheckoutPlan = "single" | "pack3" | "subscription";
export type CheckoutOrderType = "digital" | "print";
export type { PrintVariant } from "@/lib/printCatalog";

export type PricingTier = {
  id: CheckoutPlan;
  label: string;
  amountCents: number;
  currency: string;
  credits?: number;
  interval?: "month";
};

export type PrintPricingTier = {
  id: PrintVariant;
  label: string;
  amountCents: number;
  currency: string;
  includesFrame: boolean;
};

function parseIntEnv(name: string, fallback: number): number {
  let raw: string | undefined;

  if (typeof window === "undefined") {
    raw = process.env[name];
  }

  if (!raw) {
    if (name === "PRICE_CENTS") raw = process.env.NEXT_PUBLIC_PRICE_CENTS;
    else if (name === "PRICE_SINGLE_CENTS") raw = process.env.NEXT_PUBLIC_PRICE_SINGLE_CENTS;
    else if (name === "PACK3_PRICE_CENTS") raw = process.env.NEXT_PUBLIC_PACK3_PRICE_CENTS;
    else if (name === "SUBSCRIPTION_PRICE_CENTS") raw = process.env.NEXT_PUBLIC_SUBSCRIPTION_PRICE_CENTS;
    else if (name === "PRINT_UNFRAMED_PRICE_CENTS") raw = process.env.NEXT_PUBLIC_PRINT_UNFRAMED_PRICE_CENTS;
    else if (name === "PRINT_FRAMED_PRICE_CENTS") raw = process.env.NEXT_PUBLIC_PRINT_FRAMED_PRICE_CENTS;
    else if (name === "PRINT_DIGITAL_ADDON_PRICE_CENTS") raw = process.env.NEXT_PUBLIC_PRINT_DIGITAL_ADDON_PRICE_CENTS;
  }

  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePrintSkuPriceCents(rowId: PrintVariant): number {
  const row = getPrintCatalogRow(rowId);
  let raw: string | undefined;

  if (typeof window === "undefined") {
    raw = process.env[row.priceEnv];
  }

  if (!raw) {
    switch (rowId) {
      case "poster_unframed":
        raw = process.env.NEXT_PUBLIC_PRINT_UNFRAMED_PRICE_CENTS;
        break;
      case "poster_framed":
        raw = process.env.NEXT_PUBLIC_PRINT_FRAMED_PRICE_CENTS;
        break;
      case "canvas_wrap":
        raw = process.env.NEXT_PUBLIC_PRINT_CANVAS_WRAP_PRICE_CENTS;
        break;
      case "mug_11oz":
        raw = process.env.NEXT_PUBLIC_PRINT_MUG_11OZ_PRICE_CENTS;
        break;
      case "card_4x6":
        raw = process.env.NEXT_PUBLIC_PRINT_CARD_4X6_PRICE_CENTS;
        break;
      default:
        raw = undefined;
    }
  }

  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : row.priceFallbackCents;
}

function parsePrintSkuLabel(rowId: PrintVariant): string {
  const row = getPrintCatalogRow(rowId);
  let raw: string | undefined;

  if (typeof window === "undefined") {
    raw = process.env[row.labelEnv];
  }

  if (!raw?.trim()) {
    switch (rowId) {
      case "poster_unframed":
        raw = process.env.NEXT_PUBLIC_PRINT_UNFRAMED_LABEL;
        break;
      case "poster_framed":
        raw = process.env.NEXT_PUBLIC_PRINT_FRAMED_LABEL;
        break;
      case "canvas_wrap":
        raw = process.env.NEXT_PUBLIC_PRINT_CANVAS_WRAP_LABEL;
        break;
      case "mug_11oz":
        raw = process.env.NEXT_PUBLIC_PRINT_MUG_11OZ_LABEL;
        break;
      case "card_4x6":
        raw = process.env.NEXT_PUBLIC_PRINT_CARD_4X6_LABEL;
        break;
      default:
        raw = undefined;
    }
  }

  const trimmed = raw?.trim();
  return trimmed ? trimmed : row.labelFallback;
}

function readEnv(): PricingEnv {
  const legacyBase = parseIntEnv("PRICE_CENTS", 900);
  const basePriceCents = parseIntEnv("PRICE_SINGLE_CENTS", legacyBase);
  const pack3PriceCents = parseIntEnv("PACK3_PRICE_CENTS", 1000);
  const subscriptionPriceCents = parseIntEnv("SUBSCRIPTION_PRICE_CENTS", 1900);

  const currency =
    typeof window === "undefined"
      ? (process.env.CURRENCY ?? process.env.NEXT_PUBLIC_CURRENCY ?? "usd")
      : (process.env.NEXT_PUBLIC_CURRENCY ?? "usd");

  return {
    basePriceCents,
    pack3PriceCents,
    subscriptionPriceCents,
    currency,
  };
}

export function getPricingInfo(opts?: { now?: Date }): PricingInfo {
  void opts;
  const env = readEnv();

  return {
    currency: env.currency,
    baseAmountCents: env.basePriceCents,
    activeAmountCents: env.basePriceCents,
    promoAmountCents: null,
    promoActive: false,
    promoStart: null,
    promoEnd: null,
    promotionCodeId: null,
  };
}

export function getPricingTiers(opts?: { now?: Date }): Record<CheckoutPlan, PricingTier> {
  const pricingInfo = getPricingInfo({ now: opts?.now });
  const env = readEnv();
  return {
    single: {
      id: "single",
      label: "Single HD download",
      amountCents: pricingInfo.activeAmountCents,
      currency: env.currency,
      credits: 1,
    },
    pack3: {
      id: "pack3",
      label: "3 HD export credits",
      amountCents: env.pack3PriceCents,
      currency: env.currency,
      credits: 3,
    },
    subscription: {
      id: "subscription",
      label: "Unlimited HD (monthly)",
      amountCents: env.subscriptionPriceCents,
      currency: env.currency,
      interval: "month",
    },
  };
}

export function getPrintPricingTiers(): Record<PrintVariant, PrintPricingTier> {
  const env = readEnv();
  const entries = PRINT_CATALOG.map((row) => {
    const id = row.id;
    return [
      id,
      {
        id,
        label: parsePrintSkuLabel(id),
        amountCents: parsePrintSkuPriceCents(id),
        currency: env.currency,
        includesFrame: row.includesFrame,
      } satisfies PrintPricingTier,
    ] as const;
  });
  return Object.fromEntries(entries) as Record<PrintVariant, PrintPricingTier>;
}

export function getPrintDigitalAddOnPrice(): { amountCents: number; currency: string } {
  const env = readEnv();
  const amountCents = parseIntEnv("PRINT_DIGITAL_ADDON_PRICE_CENTS", 700);
  return { amountCents, currency: env.currency };
}

export function formatPrice(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}
