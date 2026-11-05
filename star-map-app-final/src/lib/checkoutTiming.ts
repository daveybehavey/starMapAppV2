/**
 * Checkout stage-timing instrumentation (measurement only).
 *
 * The checkout route threads one {@link CheckoutTimingCollector} through
 * a request; stages record elapsed milliseconds into it and the handler
 * emits ONE structured `checkout_timing` console line per checkout that
 * reaches session creation. This module never changes session params,
 * amounts, call order, retries, or any payment behaviour — it only
 * observes durations and which already-existing fallbacks fired.
 *
 * Cold/warm marker: {@link CHECKOUT_ISOLATE_STARTED_AT_MS} is captured
 * once when this module is first loaded in the isolate. The first
 * checkout timed in an isolate is reported as cold; later ones as warm,
 * with the isolate age attached so the split can be re-cut when reading
 * the logs.
 */

export const CHECKOUT_ISOLATE_STARTED_AT_MS = Date.now();

let isolateHasTimedCheckout = false;

export type CheckoutIsolateTiming = {
  cold: boolean;
  isolateStartedAt: string;
  isolateAgeMs: number;
};

export function checkoutIsolateTiming(nowMs: number = Date.now()): CheckoutIsolateTiming {
  const cold = !isolateHasTimedCheckout;
  isolateHasTimedCheckout = true;
  return {
    cold,
    isolateStartedAt: new Date(CHECKOUT_ISOLATE_STARTED_AT_MS).toISOString(),
    isolateAgeMs: Math.max(0, Math.round(nowMs - CHECKOUT_ISOLATE_STARTED_AT_MS)),
  };
}

/** Test-only reset for the module-scope cold flag. */
export function resetCheckoutIsolateTimingForTests(): void {
  isolateHasTimedCheckout = false;
}

export function roundTimingMs(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 10) / 10;
}

/**
 * Checkout timing counter names (KV counters in `lib/funnel.ts`).
 * Fixed allowlist — counter names are never derived from client input.
 */
export const CHECKOUT_TIMING_COUNTERS = [
  "consent_fallback_fired",
  "discount_fallback_fired",
  "url_recovery_fired",
  "printful_quote_lt1s",
  "printful_quote_1_3s",
  "printful_quote_3_10s",
  "printful_quote_gt10s",
] as const;

export type CheckoutTimingCounter = (typeof CHECKOUT_TIMING_COUNTERS)[number];

/** Printful quote duration buckets for the KV counters in `lib/funnel.ts`. */
export type PrintfulQuoteBucket = "lt1s" | "1-3s" | "3-10s" | "gt10s";

/** Map a Printful quote bucket to its KV counter name. */
export function checkoutTimingCounterForPrintfulQuoteBucket(
  bucket: PrintfulQuoteBucket | string | null | undefined
): CheckoutTimingCounter | null {
  switch (bucket) {
    case "lt1s":
      return "printful_quote_lt1s";
    case "1-3s":
      return "printful_quote_1_3s";
    case "3-10s":
      return "printful_quote_3_10s";
    case "gt10s":
      return "printful_quote_gt10s";
    default:
      return null;
  }
}

export function printfulQuoteBucket(ms: number | null | undefined): PrintfulQuoteBucket | null {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return null;
  if (ms < 1_000) return "lt1s";
  if (ms < 3_000) return "1-3s";
  if (ms < 10_000) return "3-10s";
  return "gt10s";
}

/**
 * Mutable per-request stage record. Handlers create one at entry, pass
 * it into `createCheckoutSession`, and read the filled stages back when
 * emitting the timing line. All fields start null/false — a stage that
 * never ran (e.g. no merch quote on a digital order) stays null, never 0.
 */
export type CheckoutTimingCollector = {
  /** `performance.now()` at handler entry. */
  startedAtPerf: number;
  /** Rate-limit + referral + asset + map + promo pre-reads, up to the session-create call. */
  preCreateMs: number | null;
  /** Sub-slice of `preCreateMs`: the promo-code resolve on its own. */
  promoMs: number | null;
  /** Merch only: the live Printful shipping quote inside session creation. */
  merchPrintfulQuoteMs: number | null;
  /** Stripe session create, including any fallback creates and URL-recovery retrieve. */
  stripeCreateMs: number | null;
  /** Idempotency cache write + funnel steps after the session exists. */
  postCreateMs: number | null;
  consentFallbackFired: boolean;
  discountFallbackFired: boolean;
  urlRecoveryFired: boolean;
};

export function createCheckoutTimingCollector(
  startedAtPerf: number = performance.now()
): CheckoutTimingCollector {
  return {
    startedAtPerf,
    preCreateMs: null,
    promoMs: null,
    merchPrintfulQuoteMs: null,
    stripeCreateMs: null,
    postCreateMs: null,
    consentFallbackFired: false,
    discountFallbackFired: false,
    urlRecoveryFired: false,
  };
}

/** Which Stripe fallback(s) fired, as one stable log tag. */
export function stripeFallbackTag(collector: CheckoutTimingCollector): string {
  const fired: string[] = [];
  if (collector.consentFallbackFired) fired.push("consent");
  if (collector.discountFallbackFired) fired.push("discount");
  if (collector.urlRecoveryFired) fired.push("url_recovery");
  return fired.length ? fired.join("+") : "none";
}

export type CheckoutTimingLogInput = {
  correlationId: string;
  method: "GET" | "POST";
  checkoutKind: string;
  outcome: "created" | "error";
  qa: boolean;
  collector: CheckoutTimingCollector;
  isolate?: CheckoutIsolateTiming;
  /** `performance.now()` at emit time; defaults to now. */
  endedAtPerf?: number;
};

export function buildCheckoutTimingLog(input: CheckoutTimingLogInput) {
  const isolate = input.isolate ?? checkoutIsolateTiming();
  const endedAtPerf = input.endedAtPerf ?? performance.now();
  return {
    correlationId: input.correlationId,
    method: input.method,
    checkoutKind: input.checkoutKind,
    outcome: input.outcome,
    qa: input.qa,
    cold: isolate.cold,
    isolateStartedAt: isolate.isolateStartedAt,
    isolateAgeMs: isolate.isolateAgeMs,
    preCreateMs: roundTimingMs(input.collector.preCreateMs),
    promoMs: roundTimingMs(input.collector.promoMs),
    merchPrintfulQuoteMs: roundTimingMs(input.collector.merchPrintfulQuoteMs),
    stripeCreateMs: roundTimingMs(input.collector.stripeCreateMs),
    postCreateMs: roundTimingMs(input.collector.postCreateMs),
    totalMs: roundTimingMs(endedAtPerf - input.collector.startedAtPerf),
    stripeFallback: stripeFallbackTag(input.collector),
    consentFallbackFired: input.collector.consentFallbackFired,
    discountFallbackFired: input.collector.discountFallbackFired,
    urlRecoveryFired: input.collector.urlRecoveryFired,
  };
}

export function logCheckoutTiming(input: CheckoutTimingLogInput): void {
  console.info("checkout_timing", buildCheckoutTimingLog(input));
}
