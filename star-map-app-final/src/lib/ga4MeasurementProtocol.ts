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
  campaign?: string;
  source?: string;
  medium?: string;
  content?: string;
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
const PRINT_VARIANT_BASE_CENTS: Record<PrintVariant, number> = {
  poster_unframed: getPublicNumber(
    "NEXT_PUBLIC_PRINT_UNFRAMED_PRICE_CENTS",
    getPublicNumber("PRINT_UNFRAMED_PRICE_CENTS", 4900),
  ),
  poster_framed: getPublicNumber(
    "NEXT_PUBLIC_PRINT_FRAMED_PRICE_CENTS",
    getPublicNumber("PRINT_FRAMED_PRICE_CENTS", 9900),
  ),
  canvas_wrap: getPublicNumber(
    "NEXT_PUBLIC_PRINT_CANVAS_WRAP_PRICE_CENTS",
    getPublicNumber("PRINT_CANVAS_WRAP_PRICE_CENTS", 5900),
  ),
  mug_11oz: getPublicNumber(
    "NEXT_PUBLIC_PRINT_MUG_11OZ_PRICE_CENTS",
    getPublicNumber("PRINT_MUG_11OZ_PRICE_CENTS", 3900),
  ),
  card_4x6: getPublicNumber(
    "NEXT_PUBLIC_PRINT_CARD_4X6_PRICE_CENTS",
    getPublicNumber("PRINT_CARD_4X6_PRICE_CENTS", 1900),
  ),
};
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
    const v = input.printVariant ?? "poster_unframed";
    return `print_${v}`;
  }
  if (input.plan === "pack3") return "digital_pack3";
  if (input.plan === "subscription") return "digital_subscription";
  return "digital_single";
}

function getCheckoutItemName(input: Ga4PurchaseInput) {
  if (input.orderType === "print") {
    const v = input.printVariant ?? "poster_unframed";
    const names: Record<PrintVariant, string> = {
      poster_framed: "Custom Framed Star Map Print",
      poster_unframed: "Custom Star Map Print",
      canvas_wrap: "Canvas Gallery Wrap Star Map",
      mug_11oz: "Star Map Mug (11 oz)",
      card_4x6: "Star Map Greeting Card",
    };
    const label = names[v];
    return input.includeDigitalAddOn && v === "poster_framed" ? `${label} + HD Download` : label;
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
    const variant = input.printVariant ?? "poster_unframed";
    const base = PRINT_VARIANT_BASE_CENTS[variant] ?? PRINT_VARIANT_BASE_CENTS.poster_unframed;
    const addon =
      input.includeDigitalAddOn && variant === "poster_framed" ? PRINT_DIGITAL_ADDON_CENTS : 0;
    return (base + addon) / 100;
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
    ...(input.campaign ? { campaign: input.campaign } : {}),
    ...(input.source ? { source: input.source } : {}),
    ...(input.medium ? { medium: input.medium } : {}),
    ...(input.content ? { content: input.content } : {}),
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
export async function recordGa4PurchaseOnce(
  input: Ga4PurchaseInput,
  options?: { skipQa?: boolean },
): Promise<void> {
  const transactionId = input.transactionId.trim();
  if (!transactionId) return;

  if (options?.skipQa) return;

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
