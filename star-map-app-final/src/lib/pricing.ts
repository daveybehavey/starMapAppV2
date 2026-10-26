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
      case "poster_unframed_16x16":
        raw = process.env.NEXT_PUBLIC_PRINT_UNFRAMED_16X16_PRICE_CENTS;
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
      case "poster_unframed_16x16":
        raw = process.env.NEXT_PUBLIC_PRINT_UNFRAMED_16X16_LABEL;
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
  const pack3PriceCents = parseIntEnv("PACK3_PRICE_CENTS", 1900);
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

/**
 * Native CAD price book (T-FLEET-103) — the Canadian-buyer counterpart
 * of the USD book above, struck at the fixed 1.40 CAD/USD reference
 * rate with no conversion uplift and rounded to whole dollars (design
 * §2.1):
 *
 *   single $9 -> CA$13 · pack3 $19 -> CA$27 · subscription $19 -> CA$27
 *   poster $49 -> CA$69 · framed $99 -> CA$139 · canvas $79 -> CA$111
 *   mug $39 -> CA$55 · card $19 -> CA$27 · HD add-on $7 -> CA$10
 *   merch $9/$14/$14/$29/$49 -> CA$13/20/20/41/69
 *
 * Print amounts live on the catalog rows (priceCadFallbackCents in
 * printCatalog.ts), merch amounts on the families (merchCatalog.ts);
 * the digital amounts live here. The CAD book is deliberately NOT
 * env-overridable: repricing it is a price decision (owner approval at
 * the then-current market rate), made in code where the change is
 * reviewed — never a dashboard/env flip the pricing identity cannot
 * see. CAD line items always mint via price_data (no Stripe Price
 * objects), so this book is the only CAD price source.
 */
export const DIGITAL_CAD_PRICE_CENTS: Record<CheckoutPlan, number> = {
  single: 1300,
  pack3: 2700,
  subscription: 2700,
};

export const PRINT_DIGITAL_ADDON_CAD_PRICE_CENTS = 1000;

export function getDigitalCadPriceCents(plan: CheckoutPlan): number {
  return DIGITAL_CAD_PRICE_CENTS[plan];
}

export function getPrintDigitalAddOnCadPriceCents(): number {
  return PRINT_DIGITAL_ADDON_CAD_PRICE_CENTS;
}

export function getPrintCadPriceCents(variant: PrintVariant): number {
  return getPrintCatalogRow(variant).priceCadFallbackCents;
}

/**
 * Lever A — "second copy of the same print at 10% off" (checkout
 * add-on). Single pricing rule, consumed by the checkout line item,
 * the promotion-estimate mirror, the pricing identity, and the margin
 * guard so the four can never drift: the copy costs 90% of the
 * variant's EFFECTIVE price in the session's currency, rounded to the
 * nearest cent (Math.round on integer cents is round-half-up; every
 * current price is whole-dollar in both books, so the rule is exact
 * today — USD 4900 -> 4410, 3900 -> 3510, 9900 -> 8910, 7900 -> 7110;
 * CAD 6900 -> 6210, 5500 -> 4950, 13900 -> 12510, 11100 -> 9990).
 * The USD helper reads the effective (env-overridable) tier, so an env
 * reprice reprices the copy automatically; the CAD helper reads the
 * code-struck CAD book, deliberately not env-overridable, exactly like
 * the main CAD line.
 */
export function getPrintSecondCopyPriceCents(variant: PrintVariant): number {
  return Math.round(getPrintPricingTiers()[variant].amountCents * 0.9);
}

export function getPrintSecondCopyCadPriceCents(variant: PrintVariant): number {
  return Math.round(getPrintCadPriceCents(variant) * 0.9);
}

function parseBoolEnv(raw: string | undefined, fallback: boolean): boolean {
  if (!raw || !raw.trim()) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes"].includes(normalized)) return true;
  if (["0", "false", "no"].includes(normalized)) return false;
  return fallback;
}

/**
 * Lever A kill switches. Ship dark: both default off.
 * - Server (`PRINT_SECOND_COPY_ENABLED`): the checkout route
 *   normalises the add-on off when unset/false, mirroring the
 *   PRINT_MARGIN_GUARD_ENABLED parse pattern. Never true client-side
 *   (the var is not NEXT_PUBLIC, so it cannot leak into a bundle).
 * - Public (`NEXT_PUBLIC_PRINT_SECOND_COPY_ENABLED`): toggle
 *   visibility in the editor / paywall / mobile purchase panels.
 * Rollback is switching either off — no deploy; in-flight sessions
 * expire on the existing 2-hour TTL.
 */
export function isPrintSecondCopyEnabled(): boolean {
  if (typeof window !== "undefined") return false;
  return parseBoolEnv(process.env.PRINT_SECOND_COPY_ENABLED, false);
}

export function isPrintSecondCopyPublicEnabled(): boolean {
  const raw =
    typeof window === "undefined"
      ? process.env.NEXT_PUBLIC_PRINT_SECOND_COPY_ENABLED
      : process.env.NEXT_PUBLIC_PRINT_SECOND_COPY_ENABLED;
  return parseBoolEnv(raw, false);
}

export function formatPrice(amountCents: number, currency: string): string {
  const code = (currency || "USD").toUpperCase();
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
  // Always name the currency next to the amount (sweep U03): a bare "$"
  // leaves the currency ambiguous, and Stripe Adaptive Pricing can show
  // a converted total with a conversion fee the page never mentioned.
  // Every customer-facing price routes through here, so the code is
  // appended exactly once by construction.
  return `${formatted} ${code}`;
}
