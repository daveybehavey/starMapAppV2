type PricingEnv = {
  basePriceCents: number;
  promoPriceCents: number | null;
  promoStart: Date | null;
  promoEnd: Date | null;
  currency: string;
  forcePromo: boolean;
  promoCodeId: string | null;
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
    else if (name === 'PROMO_PRICE_CENTS') raw = process.env.NEXT_PUBLIC_PROMO_PRICE_CENTS;
  }

  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseDateEnv(name: string): Date | null {
  // Next.js requires direct property access for client-side env vars
  let raw: string | undefined;

  // Check standard env var first (server-side)
  if (typeof window === 'undefined') {
    raw = process.env[name];
  }

  // Fallback to direct NEXT_PUBLIC_ access for client-side
  if (!raw) {
    if (name === 'PROMO_START') raw = process.env.NEXT_PUBLIC_PROMO_START;
    else if (name === 'PROMO_END') raw = process.env.NEXT_PUBLIC_PROMO_END;
  }

  if (!raw) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
}

function readEnv(): PricingEnv {
  const basePriceCents = parseIntEnv("PRICE_CENTS", 99);
  const promoPriceCents = (() => {
    const raw = parseIntEnv("PROMO_PRICE_CENTS", Number.NaN);
    return Number.isFinite(raw) ? raw : null;
  })();

  // Direct access for client-side compatibility
  const currency = typeof window === 'undefined'
    ? (process.env.CURRENCY ?? process.env.NEXT_PUBLIC_CURRENCY ?? "usd")
    : (process.env.NEXT_PUBLIC_CURRENCY ?? "usd");

  const forcePromo = typeof window === 'undefined'
    ? (process.env.PROMO_ACTIVE?.toLowerCase() === "true")
    : (process.env.NEXT_PUBLIC_PROMO_ACTIVE?.toLowerCase() === "true");

  const promoCodeId = typeof window === 'undefined'
    ? (process.env.STRIPE_PROMO_CODE_ID ?? process.env.NEXT_PUBLIC_STRIPE_PROMO_CODE_ID ?? null)
    : (process.env.NEXT_PUBLIC_STRIPE_PROMO_CODE_ID ?? null);

  return {
    basePriceCents,
    promoPriceCents,
    promoStart: parseDateEnv("PROMO_START"),
    promoEnd: parseDateEnv("PROMO_END"),
    currency,
    forcePromo,
    promoCodeId,
  };
}

function isWithinWindow(now: Date, start: Date | null, end: Date | null): boolean {
  if (start && now < start) return false;
  if (end && now > end) return false;
  return true;
}

export function getPricingInfo(opts?: { now?: Date; includePromoCode?: boolean }): PricingInfo {
  const now = opts?.now ?? new Date();
  const env = readEnv();

  const inWindow = isWithinWindow(now, env.promoStart, env.promoEnd);
  const promoEligible = env.forcePromo || (env.promoPriceCents != null && inWindow);
  const promoActive = promoEligible;

  const activeAmountCents =
    promoActive && env.promoPriceCents != null ? env.promoPriceCents : env.basePriceCents;

  return {
    currency: env.currency,
    baseAmountCents: env.basePriceCents,
    activeAmountCents,
    promoAmountCents: env.promoPriceCents,
    promoActive,
    promoStart: env.promoStart,
    promoEnd: env.promoEnd,
    promotionCodeId: opts?.includePromoCode ? env.promoCodeId : null,
  };
}

export function formatPrice(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}
