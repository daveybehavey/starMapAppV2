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
export type PrintVariant = "poster_unframed" | "poster_framed";

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
  // Next.js requires direct property access for client-side env vars
  // Dynamic keys like process.env[name] don't work on client side
  let raw: string | undefined;

  // Check standard env var first (server-side)
  if (typeof window === 'undefined') {
    raw = process.env[name];
  }

  // Fallback to direct NEXT_PUBLIC_ access for client-side
  if (!raw) {
    if (name === 'PRICE_CENTS') raw = process.env.NEXT_PUBLIC_PRICE_CENTS;
    else if (name === 'PRICE_SINGLE_CENTS') raw = process.env.NEXT_PUBLIC_PRICE_SINGLE_CENTS;
    else if (name === 'PACK3_PRICE_CENTS') raw = process.env.NEXT_PUBLIC_PACK3_PRICE_CENTS;
    else if (name === 'SUBSCRIPTION_PRICE_CENTS') raw = process.env.NEXT_PUBLIC_SUBSCRIPTION_PRICE_CENTS;
    else if (name === 'PRINT_UNFRAMED_PRICE_CENTS') raw = process.env.NEXT_PUBLIC_PRINT_UNFRAMED_PRICE_CENTS;
    else if (name === 'PRINT_FRAMED_PRICE_CENTS') raw = process.env.NEXT_PUBLIC_PRINT_FRAMED_PRICE_CENTS;
    else if (name === 'PRINT_DIGITAL_ADDON_PRICE_CENTS') raw = process.env.NEXT_PUBLIC_PRINT_DIGITAL_ADDON_PRICE_CENTS;
  }

  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readEnv(): PricingEnv {
  const legacyBase = parseIntEnv("PRICE_CENTS", 900);
  const basePriceCents = parseIntEnv("PRICE_SINGLE_CENTS", legacyBase);
  const pack3PriceCents = parseIntEnv("PACK3_PRICE_CENTS", 1000);
  const subscriptionPriceCents = parseIntEnv("SUBSCRIPTION_PRICE_CENTS", 1900);

  // Direct access for client-side compatibility
  const currency = typeof window === 'undefined'
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
      label: "3 HD downloads",
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
  const unframedPriceCents = parseIntEnv("PRINT_UNFRAMED_PRICE_CENTS", 4900);
  const framedPriceCents = parseIntEnv("PRINT_FRAMED_PRICE_CENTS", 8900);
  return {
    poster_unframed: {
      id: "poster_unframed",
      label: "Museum-grade poster (unframed)",
      amountCents: unframedPriceCents,
      currency: env.currency,
      includesFrame: false,
    },
    poster_framed: {
      id: "poster_framed",
      label: "Framed print",
      amountCents: framedPriceCents,
      currency: env.currency,
      includesFrame: true,
    },
  };
}

export function getPrintDigitalAddOnPrice(): { amountCents: number; currency: string } {
  const env = readEnv();
  const amountCents = parseIntEnv("PRINT_DIGITAL_ADDON_PRICE_CENTS", 500);
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
