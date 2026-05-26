import type { FunnelStep } from "./funnelSteps";
import type { CheckoutOrderType, CheckoutPlan, PrintVariant } from "./pricing";

export type EventProps = Record<string, string | number | boolean | undefined | null>;

export const ANALYTICS_STORAGE_KEY = "analytics-consent";
export const PENDING_GA4_PURCHASE_KEY = "ga4:pending-purchase";

let posthogPromise: Promise<typeof import("posthog-js").default> | null = null;

type CheckoutAnalyticsInput = {
  plan?: CheckoutPlan | null;
  orderType?: CheckoutOrderType;
  printVariant?: PrintVariant | null;
  includeDigitalAddOn?: boolean;
  value?: number | null;
  currency?: string | null;
};

type PurchaseAnalyticsInput = CheckoutAnalyticsInput & {
  transactionId: string;
};

type EcommerceItemInput = CheckoutAnalyticsInput & {
  index?: number;
};

type ItemListAnalyticsInput = {
  itemListId: string;
  itemListName?: string;
  items: EcommerceItemInput[];
};

type ItemSelectionAnalyticsInput = {
  itemListId: string;
  itemListName?: string;
  item: EcommerceItemInput;
};

export const loadPosthogClient = async () => {
  if (!posthogPromise) {
    posthogPromise = import("posthog-js").then((mod) => mod.default);
  }
  return posthogPromise;
};

// Type declarations for third-party analytics on window
type GtagFunction = (
  command: string,
  eventName?: string | Date,
  params?: Record<string, unknown>,
) => void;

declare global {
  interface Window {
    gtag?: GtagFunction;
  }
}

function canTrackAnalytics() {
  if (typeof window === "undefined") return false;
  if (!hasAnalyticsConsent()) return false;
  if (isDoNotTrackEnabled()) return false;
  return true;
}

function getPublicNumber(name: string, fallback: number) {
  const raw = (process.env as Record<string, string | undefined>)[name];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

const DEFAULT_CURRENCY = (process.env.NEXT_PUBLIC_CURRENCY || "usd").trim().toUpperCase();
const DIGITAL_SINGLE_CENTS = getPublicNumber("NEXT_PUBLIC_PRICE_SINGLE_CENTS", 900);
const DIGITAL_PACK3_CENTS = getPublicNumber("NEXT_PUBLIC_PACK3_PRICE_CENTS", 1000);
const DIGITAL_SUBSCRIPTION_CENTS = getPublicNumber("NEXT_PUBLIC_SUBSCRIPTION_PRICE_CENTS", 1900);
const PRINT_DIGITAL_ADDON_CENTS = getPublicNumber("NEXT_PUBLIC_PRINT_DIGITAL_ADDON_PRICE_CENTS", 700);

const PRINT_VARIANT_BASE_CENTS: Record<PrintVariant, number> = {
  poster_unframed: getPublicNumber("NEXT_PUBLIC_PRINT_UNFRAMED_PRICE_CENTS", 4900),
  poster_framed: getPublicNumber("NEXT_PUBLIC_PRINT_FRAMED_PRICE_CENTS", 9900),
  canvas_wrap: getPublicNumber("NEXT_PUBLIC_PRINT_CANVAS_WRAP_PRICE_CENTS", 5900),
  mug_11oz: getPublicNumber("NEXT_PUBLIC_PRINT_MUG_11OZ_PRICE_CENTS", 3900),
  card_4x6: getPublicNumber("NEXT_PUBLIC_PRINT_CARD_4X6_PRICE_CENTS", 1900),
};

function canTrackFunnelCounters() {
  if (typeof window === "undefined") return false;
  if (isDoNotTrackEnabled()) return false;
  return true;
}

function removeUndefinedValues<T extends Record<string, unknown>>(value: T): T {
  const out = {} as T;
  for (const [key, field] of Object.entries(value)) {
    if (field !== undefined) {
      (out as Record<string, unknown>)[key] = field;
    }
  }
  return out;
}

export function runWhenIdle(task: () => void, timeout = 1200) {
  if (typeof window === "undefined") return;
  type IdleCallback = (cb: () => void, opts?: { timeout?: number }) => number;
  const idleCallback = (window as Window & { requestIdleCallback?: IdleCallback }).requestIdleCallback;
  if (typeof idleCallback === "function") {
    idleCallback(() => task(), { timeout });
  } else {
    setTimeout(task, timeout);
  }
}

export function track(event: string, props?: EventProps) {
  if (!canTrackAnalytics()) return;
  const payload = removeUndefinedValues({
    ...props,
    route: window.location.pathname,
  });
  try {
    void loadPosthogClient().then((posthog) => {
      posthog.capture?.(event, payload);
    });
    if (typeof window.gtag === "function") {
      window.gtag("event", event, payload);
    }
  } catch {
    // silently ignore tracking errors
  }
}

function getCheckoutItemId(input: CheckoutAnalyticsInput) {
  if (input.orderType === "print") {
    const v = input.printVariant ?? "poster_unframed";
    return `print_${v}`;
  }
  if (input.plan === "pack3") return "digital_pack3";
  if (input.plan === "subscription") return "digital_subscription";
  return "digital_single";
}

function getCheckoutItemName(input: CheckoutAnalyticsInput) {
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

function estimateCheckoutValue(input: CheckoutAnalyticsInput) {
  if (typeof input.value === "number" && Number.isFinite(input.value) && input.value > 0) {
    return input.value;
  }
  if (input.orderType === "print") {
    const variant = input.printVariant ?? "poster_unframed";
    const base = PRINT_VARIANT_BASE_CENTS[variant] ?? PRINT_VARIANT_BASE_CENTS.poster_unframed;
    const addon =
      input.includeDigitalAddOn && variant === "poster_framed" ? PRINT_DIGITAL_ADDON_CENTS : 0;
    const total = base + addon;
    return total / 100;
  }
  if (input.plan === "pack3") return DIGITAL_PACK3_CENTS / 100;
  if (input.plan === "subscription") return DIGITAL_SUBSCRIPTION_CENTS / 100;
  return DIGITAL_SINGLE_CENTS / 100;
}

function getCheckoutCurrency(input: CheckoutAnalyticsInput) {
  return (input.currency || DEFAULT_CURRENCY).trim().toUpperCase();
}

function sendGaEvent(eventName: string, params: Record<string, unknown>) {
  if (!canTrackAnalytics()) return;
  if (typeof window.gtag !== "function") return;
  window.gtag("event", eventName, removeUndefinedValues(params));
}

function buildGaItem(input: EcommerceItemInput) {
  return removeUndefinedValues({
    item_id: getCheckoutItemId(input),
    item_name: getCheckoutItemName(input),
    item_category: input.orderType === "print" ? "print" : "digital",
    item_variant: input.orderType === "print" ? input.printVariant ?? undefined : input.plan ?? undefined,
    quantity: 1,
    price: estimateCheckoutValue(input),
    index: typeof input.index === "number" ? input.index : undefined,
  });
}

export function trackViewItemList(input: ItemListAnalyticsInput) {
  if (!input.items.length) return;
  sendGaEvent("view_item_list", {
    currency: getCheckoutCurrency(input.items[0]),
    item_list_id: input.itemListId,
    item_list_name: input.itemListName ?? input.itemListId,
    items: input.items.map((item) => buildGaItem(item)),
  });
}

export function trackSelectItem(input: ItemSelectionAnalyticsInput) {
  sendGaEvent("select_item", {
    currency: getCheckoutCurrency(input.item),
    item_list_id: input.itemListId,
    item_list_name: input.itemListName ?? input.itemListId,
    items: [buildGaItem(input.item)],
  });
}

export function trackBeginCheckout(input: CheckoutAnalyticsInput & { source?: string }) {
  sendGaEvent("begin_checkout", {
    currency: getCheckoutCurrency(input),
    value: estimateCheckoutValue(input),
    items: [buildGaItem(input)],
    source: input.source,
  });
}

function persistPendingGa4Purchase(input: PurchaseAnalyticsInput) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PENDING_GA4_PURCHASE_KEY, JSON.stringify(input));
  } catch {
    // Ignore storage failures.
  }
}

function ga4ServerPurchaseTrackingEnabled() {
  return process.env.NEXT_PUBLIC_GA4_SERVER_PURCHASES === "true";
}

export function trackPurchaseCompleted(input: PurchaseAnalyticsInput) {
  const paidTotal =
    typeof input.value === "number" && Number.isFinite(input.value) ? input.value : null;
  const serverOnly =
    ga4ServerPurchaseTrackingEnabled() && (paidTotal === null || paidTotal > 0);

  if (serverOnly) {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(PENDING_GA4_PURCHASE_KEY);
      } catch {
        // Ignore storage failures.
      }
    }
    return;
  }

  if (!canTrackAnalytics()) {
    persistPendingGa4Purchase(input);
    return;
  }

  const value = estimateCheckoutValue(input);
  sendGaEvent("purchase", {
    transaction_id: input.transactionId,
    currency: getCheckoutCurrency(input),
    value,
    ...(paidTotal !== null && paidTotal <= 0 ? { free_checkout: true } : {}),
    items: [buildGaItem({ ...input, value })],
  });
  try {
    sessionStorage.removeItem(PENDING_GA4_PURCHASE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

/** Fire a purchase saved on /success when the user grants analytics consent afterward. */
export function flushPendingGa4Purchase() {
  if (ga4ServerPurchaseTrackingEnabled() || !canTrackAnalytics() || typeof window === "undefined") return;
  try {
    const raw = sessionStorage.getItem(PENDING_GA4_PURCHASE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as PurchaseAnalyticsInput;
    if (!parsed?.transactionId) return;
    const dedupeKey = `ga4:purchase:${parsed.transactionId}`;
    if (sessionStorage.getItem(dedupeKey) === "true") {
      sessionStorage.removeItem(PENDING_GA4_PURCHASE_KEY);
      return;
    }
    trackPurchaseCompleted(parsed);
    sessionStorage.setItem(dedupeKey, "true");
  } catch {
    // Ignore parse/storage failures.
  }
}

export function trackPageView(input?: {
  path?: string;
  search?: string;
  title?: string;
  location?: string;
}) {
  if (typeof window === "undefined") return;
  const path = input?.path || window.location.pathname;
  const search = typeof input?.search === "string" ? input.search : window.location.search;
  const location =
    input?.location ||
    `${window.location.origin}${path}${search.startsWith("?") || search === "" ? search : `?${search}`}`;
  sendGaEvent("page_view", {
    page_path: path,
    page_title: input?.title || document.title,
    page_location: location,
  });
}

function postFunnelCounter(payload: {
  step: FunnelStep;
  source?: string;
  plan?: string;
  experiment?: string;
  variant?: string;
}) {
  if (typeof window === "undefined") return;
  const body = JSON.stringify(removeUndefinedValues(payload));
  try {
    if (typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/analytics/funnel", blob);
      return;
    }
  } catch {
    // Fallback to fetch below.
  }
  void fetch("/api/analytics/funnel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

const CHECKOUT_CLIENT_DIAGNOSTIC_ALLOWED_REASONS = new Set([
  "missing_shipping_country",
  "print_render_failed",
  "print_asset_failed",
  "print_asset_too_large",
  "asset_upload_failed",
  "missing_recipe",
  "missing_print_asset",
  "invalid_promotion_code",
  "promotion_not_applicable",
  "promotion_lookup_failed",
  "print_checkout_disabled",
  "print_shipping_country_invalid",
  "print_margin_guard_blocked",
  "print_promotion_margin_blocked",
  "checkout_failed",
  "no_checkout_url",
  "no_url",
  "network_error",
  "request_aborted",
  "unknown_client_error",
]);

function normalizeCheckoutClientDiagnosticReason(input: string | undefined) {
  if (!input) return "unknown_client_error";
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  if (!normalized) return "unknown_client_error";
  if (normalized.includes("failed_to_fetch") || normalized.includes("networkerror")) return "network_error";
  if (normalized.includes("abort")) return "request_aborted";
  if (CHECKOUT_CLIENT_DIAGNOSTIC_ALLOWED_REASONS.has(normalized)) return normalized;
  return "unknown_client_error";
}

function postCheckoutClientDiagnostic(payload: {
  reason: string;
  source?: string;
  plan?: string;
  orderType?: CheckoutOrderType;
  printVariant?: PrintVariant;
  includeDigitalAddOn?: boolean;
}) {
  if (typeof window === "undefined") return;
  const body = JSON.stringify(removeUndefinedValues(payload));
  try {
    if (typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/analytics/checkout-diagnostics", blob);
      return;
    }
  } catch {
    // Fallback to fetch below.
  }
  void fetch("/api/analytics/checkout-diagnostics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

type FunnelEventProps = EventProps & {
  source?: string;
  plan?: string;
  experiment?: string;
  variant?: string;
};

export function trackFunnelStep(step: FunnelStep, props?: FunnelEventProps) {
  const payload = removeUndefinedValues({
    step,
    ...props,
  });
  if (canTrackAnalytics()) {
    track("funnel_step", payload);
  }
  if (canTrackFunnelCounters()) {
    postFunnelCounter({
      step,
      source: typeof payload.source === "string" ? payload.source : undefined,
      plan: typeof payload.plan === "string" ? payload.plan : undefined,
      experiment: typeof payload.experiment === "string" ? payload.experiment : undefined,
      variant: typeof payload.variant === "string" ? payload.variant : undefined,
    });
  }
}

export function trackCheckoutClientDiagnostic(input: {
  reason: string;
  source?: string;
  plan?: string;
  orderType?: CheckoutOrderType;
  printVariant?: PrintVariant;
  includeDigitalAddOn?: boolean;
}) {
  const reason = normalizeCheckoutClientDiagnosticReason(input.reason);
  const payload = removeUndefinedValues({
    reason,
    source: input.source,
    plan: input.plan,
    orderType: input.orderType,
    printVariant: input.printVariant,
    includeDigitalAddOn: input.includeDigitalAddOn,
  });
  if (canTrackAnalytics()) {
    track("checkout_client_blocked", payload);
  }
  if (canTrackFunnelCounters()) {
    postCheckoutClientDiagnostic({
      reason,
      source: typeof payload.source === "string" ? payload.source : undefined,
      plan: typeof payload.plan === "string" ? payload.plan : undefined,
      orderType: payload.orderType === "print" ? "print" : payload.orderType === "digital" ? "digital" : undefined,
      printVariant: payload.printVariant,
      includeDigitalAddOn:
        typeof payload.includeDigitalAddOn === "boolean" ? payload.includeDigitalAddOn : undefined,
    });
  }
}

export function trackExperimentExposure(
  experiment: string,
  variant: string,
  props?: EventProps,
) {
  if (!canTrackAnalytics()) return;
  const dedupeKey = `exp:${experiment}:${variant}:seen`;
  try {
    if (sessionStorage.getItem(dedupeKey) === "true") return;
    sessionStorage.setItem(dedupeKey, "true");
  } catch {
    // Ignore storage failures and continue tracking.
  }
  track("experiment_exposure", {
    experiment,
    variant,
    ...props,
  });
}

export function isDoNotTrackEnabled() {
  if (typeof window === "undefined") return false;
  const dnt =
    window.navigator.doNotTrack ||
    (window as typeof window & { doNotTrack?: string }).doNotTrack ||
    (window.navigator as typeof window.navigator & { msDoNotTrack?: string }).msDoNotTrack;
  return dnt === "1" || dnt === "yes";
}

export function hasAnalyticsConsent() {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(ANALYTICS_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}
