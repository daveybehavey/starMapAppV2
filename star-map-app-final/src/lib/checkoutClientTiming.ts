/**
 * Client-side checkout stage-timing instrumentation (measurement only).
 *
 * Mirrors the server `checkout_timing` console line in `lib/checkoutTiming.ts`
 * so client and server logs share one event name and a comparable shape.
 * The payload always carries `client: true` so the two sides stay
 * distinguishable. This module never changes checkout, payments, pricing,
 * or navigation — it only records performance marks and emits timings.
 *
 * Emit path: `console.info("checkout_timing", …)` (same channel/name as
 * the server). Callers may also piggyback an existing analytics `track`
 * flush; no new network endpoint is introduced. Failures are swallowed so
 * the feature is inert when `performance` / telemetry is unavailable.
 */

import { roundTimingMs } from "./checkoutTiming";

/** Ordered client stages from pay click through Stripe handoff. */
export const CHECKOUT_CLIENT_TIMING_STAGES = [
  "submit",
  "request_sent",
  "response_received",
  "redirect",
] as const;

export type CheckoutClientTimingStage = (typeof CHECKOUT_CLIENT_TIMING_STAGES)[number];

const MARK_PREFIX = "checkout_client_timing:";

export type CheckoutClientTimingCollector = {
  /** `performance.now()` (or Date fallback) at collector creation / submit. */
  startedAtPerf: number;
  /** Absolute perf timestamps per stage; unset stages stay missing (never 0). */
  marks: Partial<Record<CheckoutClientTimingStage, number>>;
};

function safePerfNow(): number {
  try {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }
  } catch {
    // measurement must never throw into checkout
  }
  return Date.now();
}

function safePerformanceMark(stage: CheckoutClientTimingStage): void {
  try {
    if (typeof performance !== "undefined" && typeof performance.mark === "function") {
      performance.mark(`${MARK_PREFIX}${stage}`);
    }
  } catch {
    // inert when the Performance Timeline API is unavailable
  }
}

export function createCheckoutClientTimingCollector(
  startedAtPerf: number = safePerfNow()
): CheckoutClientTimingCollector {
  return {
    startedAtPerf,
    marks: {},
  };
}

/**
 * Record a stage mark. First write wins so retries do not erase the
 * original request_sent / response_received timestamps that explain the
 * shopper-visible stall. Callers that need a later overwrite should pass
 * `overwrite: true` (used for the final successful response / redirect).
 */
export function markCheckoutClientTiming(
  collector: CheckoutClientTimingCollector,
  stage: CheckoutClientTimingStage,
  options?: { atPerf?: number; overwrite?: boolean }
): void {
  if (!options?.overwrite && collector.marks[stage] != null) return;
  const atPerf = options?.atPerf ?? safePerfNow();
  if (typeof atPerf !== "number" || !Number.isFinite(atPerf)) return;
  collector.marks[stage] = atPerf;
  safePerformanceMark(stage);
}

/** Elapsed ms from submit (or collector start) to a stage, or null. */
export function checkoutClientTimingElapsedMs(
  collector: CheckoutClientTimingCollector,
  stage: CheckoutClientTimingStage
): number | null {
  const mark = collector.marks[stage];
  if (typeof mark !== "number" || !Number.isFinite(mark)) return null;
  const origin = collector.marks.submit ?? collector.startedAtPerf;
  return mark - origin;
}

/**
 * Per-segment deltas between consecutive stages that both fired, plus total
 * from submit to the latest completed stage (redirect preferred).
 */
export function checkoutClientTimingDeltas(collector: CheckoutClientTimingCollector): {
  submitToRequestMs: number | null;
  requestToResponseMs: number | null;
  responseToRedirectMs: number | null;
  totalMs: number | null;
  submitMs: number | null;
  requestSentMs: number | null;
  responseReceivedMs: number | null;
  redirectMs: number | null;
} {
  const submit = collector.marks.submit ?? collector.startedAtPerf;
  const request = collector.marks.request_sent;
  const response = collector.marks.response_received;
  const redirect = collector.marks.redirect;
  const end = redirect ?? response ?? request ?? collector.marks.submit ?? null;

  return {
    submitMs: collector.marks.submit != null ? roundTimingMs(0) : null,
    requestSentMs: roundTimingMs(
      typeof request === "number" ? request - submit : null
    ),
    responseReceivedMs: roundTimingMs(
      typeof response === "number" ? response - submit : null
    ),
    redirectMs: roundTimingMs(typeof redirect === "number" ? redirect - submit : null),
    submitToRequestMs: roundTimingMs(
      typeof request === "number" ? request - submit : null
    ),
    requestToResponseMs: roundTimingMs(
      typeof request === "number" && typeof response === "number"
        ? response - request
        : null
    ),
    responseToRedirectMs: roundTimingMs(
      typeof response === "number" && typeof redirect === "number"
        ? redirect - response
        : null
    ),
    totalMs: roundTimingMs(typeof end === "number" ? end - submit : null),
  };
}

/** Stages that have a recorded mark, in canonical order. */
export function checkoutClientTimingMarkedStages(
  collector: CheckoutClientTimingCollector
): CheckoutClientTimingStage[] {
  return CHECKOUT_CLIENT_TIMING_STAGES.filter((stage) => collector.marks[stage] != null);
}

export type CheckoutClientTimingLogInput = {
  collector: CheckoutClientTimingCollector;
  /** Join key with the `/api/checkout` request; never a customer identifier. */
  correlationId?: string | null;
  outcome: "created" | "error";
  method?: "GET" | "POST";
};

/**
 * Structured payload mirroring server `buildCheckoutTimingLog`, with a
 * `client: true` marker and client stage fields only (timings + step names).
 * `stages` is a `>`-joined string so the payload stays analytics-safe
 * (no arrays / cart fields).
 */
export function buildCheckoutClientTimingLog(input: CheckoutClientTimingLogInput) {
  const deltas = checkoutClientTimingDeltas(input.collector);
  const stages = checkoutClientTimingMarkedStages(input.collector).join(">");
  return {
    client: true as const,
    correlationId: input.correlationId ?? null,
    method: input.method ?? "POST",
    outcome: input.outcome,
    stages,
    submitMs: deltas.submitMs,
    requestSentMs: deltas.requestSentMs,
    responseReceivedMs: deltas.responseReceivedMs,
    redirectMs: deltas.redirectMs,
    submitToRequestMs: deltas.submitToRequestMs,
    requestToResponseMs: deltas.requestToResponseMs,
    responseToRedirectMs: deltas.responseToRedirectMs,
    totalMs: deltas.totalMs,
  };
}

/** Analytics-safe property bag (matches `EventProps` in `analytics.ts`). */
export type CheckoutClientTimingProps = Record<
  string,
  string | number | boolean | null | undefined
>;

export type CheckoutClientTimingTrack = (
  event: string,
  props?: CheckoutClientTimingProps
) => void;

/**
 * Emit one `checkout_timing` line (same name/channel as the server) and
 * optionally piggyback an existing analytics `track` flush. Never throws.
 */
export function logCheckoutClientTiming(
  input: CheckoutClientTimingLogInput,
  options?: { track?: CheckoutClientTimingTrack }
): void {
  try {
    const log = buildCheckoutClientTimingLog(input);
    try {
      console.info("checkout_timing", log);
    } catch {
      // console may be unavailable in locked-down embeds
    }
    try {
      options?.track?.("checkout_timing", log);
    } catch {
      // analytics sink must remain best-effort
    }
  } catch {
    // measurement only — never surface into checkout
  }
}
