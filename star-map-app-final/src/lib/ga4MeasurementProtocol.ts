import { kv } from "./kv";
import type { CheckoutOrderType, CheckoutPlan, PrintVariant } from "./pricing";

export type Ga4PurchaseInput = {
  transactionId: string;
  value?: number;
  currency?: string;
  plan?: CheckoutPlan | null;
  orderType?: CheckoutOrderType;
  printVariant?: PrintVariant | null;
  includeDigitalAddOn?: boolean;
};

const GA4_MP_DEDUPE_TTL_SECONDS = 400 * 24 * 60 * 60;

function ga4MpPurchaseKey(sessionId: string) {
  return `ga4:mp:purchase:${sessionId}`;
}

function getPublicNumber(name: string, fallback: number) {
  const raw = (process.env as Record<string, string | undefined>)[name];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

const DEFAULT_CURRENCY = (process.env.NEXT_PUBLIC_CURRENCY || process.env.CURRENCY || "usd")
  .trim()
  .toUpperCase();
const DIGITAL_SINGLE_CENTS = getPublicNumber("NEXT_PUBLIC_PRICE_SINGLE_CENTS", getPublicNumber("PRICE_CENTS", 900));
const DIGITAL_PACK3_CENTS = getPublicNumber(
  "NEXT_PUBLIC_PACK3_PRICE_CENTS",
  getPublicNumber("PACK3_PRICE_CENTS", 1000),
);
const DIGITAL_SUBSCRIPTION_CENTS = getPublicNumber(
  "NEXT_PUBLIC_SUBSCRIPTION_PRICE_CENTS",
  getPublicNumber("SUBSCRIPTION_PRICE_CENTS", 1900),
);
const PRINT_UNFRAMED_CENTS = getPublicNumber(
  "NEXT_PUBLIC_PRINT_UNFRAMED_PRICE_CENTS",
  getPublicNumber("PRINT_UNFRAMED_PRICE_CENTS", 4900),
);
const PRINT_FRAMED_CENTS = getPublicNumber(
  "NEXT_PUBLIC_PRINT_FRAMED_PRICE_CENTS",
  getPublicNumber("PRINT_FRAMED_PRICE_CENTS", 9900),
);
const PRINT_DIGITAL_ADDON_CENTS = getPublicNumber(
  "NEXT_PUBLIC_PRINT_DIGITAL_ADDON_PRICE_CENTS",
  getPublicNumber("PRINT_DIGITAL_ADDON_PRICE_CENTS", 700),
);

function removeUndefinedValues<T extends Record<string, unknown>>(value: T): T {
  const out = {} as T;
  for (const [key, field] of Object.entries(value)) {
    if (field !== undefined) {
      (out as Record<string, unknown>)[key] = field;
    }
  }
  return out;
}

function getCheckoutItemId(input: Ga4PurchaseInput) {
  if (input.orderType === "print") {
    return input.printVariant === "poster_framed" ? "print_poster_framed" : "print_poster_unframed";
  }
  if (input.plan === "pack3") return "digital_pack3";
  if (input.plan === "subscription") return "digital_subscription";
  return "digital_single";
}

function getCheckoutItemName(input: Ga4PurchaseInput) {
  if (input.orderType === "print") {
    const label = input.printVariant === "poster_framed" ? "Custom Framed Star Map Print" : "Custom Star Map Print";
    return input.includeDigitalAddOn ? `${label} + HD Download` : label;
  }
  if (input.plan === "pack3") return "HD Digital Export Credits (3)";
  if (input.plan === "subscription") return "Unlimited HD Monthly";
  return "Single HD Digital Download";
}

/** Stripe `amount_total` in dollars; ignore zero so 100% promos still send a positive GA4 value. */
function stripePaidValueDollars(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

function estimateCheckoutValue(input: Ga4PurchaseInput) {
  const paid = stripePaidValueDollars(input.value);
  if (paid !== undefined) return paid;
  if (input.orderType === "print") {
    const base = input.printVariant === "poster_framed" ? PRINT_FRAMED_CENTS : PRINT_UNFRAMED_CENTS;
    const total = base + (input.includeDigitalAddOn ? PRINT_DIGITAL_ADDON_CENTS : 0);
    return total / 100;
  }
  if (input.plan === "pack3") return DIGITAL_PACK3_CENTS / 100;
  if (input.plan === "subscription") return DIGITAL_SUBSCRIPTION_CENTS / 100;
  return DIGITAL_SINGLE_CENTS / 100;
}

function getCheckoutCurrency(input: Ga4PurchaseInput) {
  return (input.currency || DEFAULT_CURRENCY).trim().toUpperCase();
}

function buildPurchaseParams(input: Ga4PurchaseInput) {
  const value = estimateCheckoutValue(input);
  const freeCheckout =
    typeof input.value === "number" && Number.isFinite(input.value) && input.value <= 0;
  return removeUndefinedValues({
    transaction_id: input.transactionId,
    currency: getCheckoutCurrency(input),
    value,
    ...(freeCheckout ? { free_checkout: true } : {}),
    items: [
      removeUndefinedValues({
        item_id: getCheckoutItemId(input),
        item_name: getCheckoutItemName(input),
        item_category: input.orderType === "print" ? "print" : "digital",
        item_variant:
          input.orderType === "print" ? input.printVariant ?? undefined : input.plan ?? undefined,
        quantity: 1,
        price: value,
      }),
    ],
  });
}

/**
 * Server-side GA4 purchase via Measurement Protocol (cookieless). Requires GA4_API_SECRET.
 */
export async function recordGa4PurchaseOnce(input: Ga4PurchaseInput): Promise<void> {
  const transactionId = input.transactionId.trim();
  if (!transactionId) return;

  const measurementId = process.env.NEXT_PUBLIC_GA_ID?.trim() || "";
  const apiSecret = process.env.GA4_API_SECRET?.trim() || "";
  if (!measurementId || !apiSecret) {
    console.warn("GA4 Measurement Protocol skipped: missing NEXT_PUBLIC_GA_ID or GA4_API_SECRET");
    return;
  }

  const dedupeKey = ga4MpPurchaseKey(transactionId);
  const prior = await kv.get<number>(dedupeKey);
  if (typeof prior === "number" && prior > 0) return;

  const url = new URL("https://www.google-analytics.com/mp/collect");
  url.searchParams.set("measurement_id", measurementId);
  url.searchParams.set("api_secret", apiSecret);

  const body = {
    client_id: `stripe.${transactionId}`,
    events: [
      {
        name: "purchase",
        params: buildPurchaseParams({ ...input, transactionId }),
      },
    ],
  };

  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn("GA4 Measurement Protocol purchase failed", res.status);
      return;
    }
    await kv.incr(dedupeKey, 1, { ex: GA4_MP_DEDUPE_TTL_SECONDS });
  } catch (err) {
    console.warn("GA4 Measurement Protocol purchase error", err);
  }
}
