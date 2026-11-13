import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CHECKOUT_ATTEMPTS_COUNTER,
  CHECKOUT_TIMING_COUNTERS,
  CHECKOUT_TIMING_DURATION_BUCKETS,
  CHECKOUT_TIMING_STAGES,
  buildCheckoutTimingLog,
  checkoutTimingAggregateIncrements,
  checkoutTimingCounterForPrintfulQuoteBucket,
  checkoutTimingDurationBucket,
  createCheckoutTimingCollector,
  printfulQuoteBucket,
  resetCheckoutIsolateTimingForTests,
  roundTimingMs,
  stripeFallbackTag,
} from "../../src/lib/checkoutTiming.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CHECKOUT_ROUTE = path.join(ROOT, "src/app/api/checkout/route.ts");
const FUNNEL = path.join(ROOT, "src/lib/funnel.ts");

test("timing: rounding rejects non-finite and negative values", () => {
  assert.equal(roundTimingMs(12.34), 12.3);
  assert.equal(roundTimingMs(0), 0);
  assert.equal(roundTimingMs(null), null);
  assert.equal(roundTimingMs(undefined), null);
  assert.equal(roundTimingMs(Number.NaN), null);
  assert.equal(roundTimingMs(-1), null);
});

test("timing: Printful quote buckets split at 1s / 3s / 10s", () => {
  assert.equal(printfulQuoteBucket(0), "lt1s");
  assert.equal(printfulQuoteBucket(999), "lt1s");
  assert.equal(printfulQuoteBucket(1_000), "1-3s");
  assert.equal(printfulQuoteBucket(2_999), "1-3s");
  assert.equal(printfulQuoteBucket(3_000), "3-10s");
  assert.equal(printfulQuoteBucket(9_999), "3-10s");
  assert.equal(printfulQuoteBucket(10_000), "gt10s");
  assert.equal(printfulQuoteBucket(60_000), "gt10s");
  assert.equal(printfulQuoteBucket(null), null);
  assert.equal(printfulQuoteBucket(Number.NaN), null);
});

test("timing: every Printful bucket maps to exactly one KV counter", () => {
  assert.equal(checkoutTimingCounterForPrintfulQuoteBucket("lt1s"), "printful_quote_lt1s");
  assert.equal(checkoutTimingCounterForPrintfulQuoteBucket("1-3s"), "printful_quote_1_3s");
  assert.equal(checkoutTimingCounterForPrintfulQuoteBucket("3-10s"), "printful_quote_3_10s");
  assert.equal(checkoutTimingCounterForPrintfulQuoteBucket("gt10s"), "printful_quote_gt10s");
  assert.equal(checkoutTimingCounterForPrintfulQuoteBucket("bogus"), null);
  assert.equal(checkoutTimingCounterForPrintfulQuoteBucket(null), null);
  for (const bucket of ["lt1s", "1-3s", "3-10s", "gt10s"]) {
    assert.ok(
      CHECKOUT_TIMING_COUNTERS.includes(checkoutTimingCounterForPrintfulQuoteBucket(bucket)),
      `counter for ${bucket} is allowlisted`,
    );
  }
  for (const base of [
    "consent_fallback_fired",
    "discount_fallback_fired",
    "printful_quote_1_3s",
    "printful_quote_3_10s",
    "printful_quote_gt10s",
    "printful_quote_lt1s",
    "url_recovery_fired",
  ]) {
    assert.ok(CHECKOUT_TIMING_COUNTERS.includes(base), `base counter ${base} is allowlisted`);
  }
});

test("timing: duration buckets split at 1s / 3s / 10s / 30s", () => {
  assert.equal(checkoutTimingDurationBucket(0), "lt1s");
  assert.equal(checkoutTimingDurationBucket(999), "lt1s");
  assert.equal(checkoutTimingDurationBucket(1_000), "1_3s");
  assert.equal(checkoutTimingDurationBucket(2_999), "1_3s");
  assert.equal(checkoutTimingDurationBucket(3_000), "3_10s");
  assert.equal(checkoutTimingDurationBucket(9_999), "3_10s");
  assert.equal(checkoutTimingDurationBucket(10_000), "10_30s");
  assert.equal(checkoutTimingDurationBucket(29_999), "10_30s");
  assert.equal(checkoutTimingDurationBucket(30_000), "gt30s");
  assert.equal(checkoutTimingDurationBucket(null), null);
  assert.equal(checkoutTimingDurationBucket(Number.NaN), null);
  assert.equal(checkoutTimingDurationBucket(-1), null);
});

test("timing: stage aggregate increments carry attempts, count, sum and one bucket per stage", () => {
  const collector = createCheckoutTimingCollector(0);
  collector.sessionSetupMs = 100;
  collector.sessionShippingMs = 100;
  collector.sessionLineItemsMs = 100;
  collector.sessionValidationMs = 100;
  collector.sessionParamsMs = 100;
  collector.preCreateMs = 500;
  collector.promoMs = 1_500;
  collector.merchPrintfulQuoteMs = 2_500;
  collector.stripeCreateMs = 12_000;
  collector.postCreateMs = 45_000;
  const increments = checkoutTimingAggregateIncrements(collector, 65_000);
  const byCounter = new Map(increments.map((increment) => [increment.counter, increment.amount]));
  assert.equal(byCounter.get(CHECKOUT_ATTEMPTS_COUNTER), 1);
  assert.equal(CHECKOUT_ATTEMPTS_COUNTER, "checkout_attempts");
  const expected = {
    session_setup: { sum: 100, bucket: "lt1s" },
    session_shipping: { sum: 100, bucket: "lt1s" },
    session_line_items: { sum: 100, bucket: "lt1s" },
    session_validation: { sum: 100, bucket: "lt1s" },
    session_params: { sum: 100, bucket: "lt1s" },
    pre_create: { sum: 500, bucket: "lt1s" },
    promo: { sum: 1_500, bucket: "1_3s" },
    printful_quote: { sum: 2_500, bucket: "1_3s" },
    stripe_create: { sum: 12_000, bucket: "10_30s" },
    post_create: { sum: 45_000, bucket: "gt30s" },
    total: { sum: 65_000, bucket: "gt30s" },
  };
  for (const stage of CHECKOUT_TIMING_STAGES) {
    assert.equal(byCounter.get(`stage_${stage}_count`), 1, `${stage} count`);
    assert.equal(byCounter.get(`stage_${stage}_sum_ms`), expected[stage].sum, `${stage} sum`);
    assert.equal(
      byCounter.get(`stage_${stage}_${expected[stage].bucket}`),
      1,
      `${stage} bucket ${expected[stage].bucket}`,
    );
    for (const bucket of CHECKOUT_TIMING_DURATION_BUCKETS) {
      if (bucket !== expected[stage].bucket) {
        assert.equal(
          byCounter.get(`stage_${stage}_${bucket}`),
          undefined,
          `${stage} lands in exactly one bucket`,
        );
      }
    }
    assert.ok(
      CHECKOUT_TIMING_COUNTERS.includes(`stage_${stage}_count`),
      `stage counter for ${stage} is allowlisted`,
    );
  }
  // attempts + all stages x (count + sum + bucket)
  assert.equal(increments.length, 1 + CHECKOUT_TIMING_STAGES.length * 3);
});

test("timing: stage aggregates skip stages that never ran and round sums", () => {
  const collector = createCheckoutTimingCollector(0);
  collector.stripeCreateMs = 250.26;
  const increments = checkoutTimingAggregateIncrements(collector, null);
  const byCounter = new Map(increments.map((increment) => [increment.counter, increment.amount]));
  assert.equal(byCounter.get("checkout_attempts"), 1);
  assert.equal(byCounter.get("stage_stripe_create_count"), 1);
  assert.equal(byCounter.get("stage_stripe_create_sum_ms"), 250);
  assert.equal(byCounter.get("stage_stripe_create_lt1s"), 1);
  assert.equal(byCounter.get("stage_pre_create_count"), undefined);
  assert.equal(byCounter.get("stage_total_count"), undefined);
  assert.equal(increments.length, 4, "attempts + the one stage that ran");
});

test("timing: fallback tag joins fired fallbacks, none when clean", () => {
  const clean = createCheckoutTimingCollector(0);
  assert.equal(stripeFallbackTag(clean), "none");
  const consentOnly = createCheckoutTimingCollector(0);
  consentOnly.consentFallbackFired = true;
  assert.equal(stripeFallbackTag(consentOnly), "consent");
  const all = createCheckoutTimingCollector(0);
  all.consentFallbackFired = true;
  all.discountFallbackFired = true;
  all.urlRecoveryFired = true;
  assert.equal(stripeFallbackTag(all), "consent+discount+url_recovery");
});

test("timing: log builder carries every stage and computes total from the collector start", () => {
  resetCheckoutIsolateTimingForTests();
  const collector = createCheckoutTimingCollector(1_000);
  collector.preCreateMs = 40.04;
  collector.promoMs = 12;
  collector.merchPrintfulQuoteMs = 2_500;
  collector.stripeCreateMs = 800;
  collector.postCreateMs = 30;
  collector.consentFallbackFired = true;
  const log = buildCheckoutTimingLog({
    correlationId: "corr-timing-1",
    method: "POST",
    checkoutKind: "print_poster_framed",
    outcome: "created",
    qa: false,
    collector,
    endedAtPerf: 4_370,
  });
  assert.equal(log.correlationId, "corr-timing-1");
  assert.equal(log.method, "POST");
  assert.equal(log.checkoutKind, "print_poster_framed");
  assert.equal(log.preCreateMs, 40);
  assert.equal(log.promoMs, 12);
  assert.equal(log.merchPrintfulQuoteMs, 2_500);
  assert.equal(log.stripeCreateMs, 800);
  assert.equal(log.postCreateMs, 30);
  assert.equal(log.totalMs, 3_370);
  assert.equal(log.stripeFallback, "consent");
  assert.equal(log.cold, true, "first timed checkout in the isolate is cold");
  const second = buildCheckoutTimingLog({
    correlationId: "corr-timing-2",
    method: "GET",
    checkoutKind: "digital_single",
    outcome: "created",
    qa: false,
    collector: createCheckoutTimingCollector(0),
    endedAtPerf: 10,
  });
  assert.equal(second.cold, false, "later checkouts in the isolate are warm");
  assert.equal(second.preCreateMs, null, "stages that never ran stay null, never 0");
  assert.equal(second.merchPrintfulQuoteMs, null);
});

test("source: funnel owns the KV timing counter writer in the recordFunnelStep pattern", () => {
  const funnel = fs.readFileSync(FUNNEL, "utf8");
  assert.match(funnel, /export async function recordCheckoutTimingCounter/);
  assert.match(funnel, /checkout_timing:total:\$\{counter\}/);
  assert.match(funnel, /checkout_timing:daily:\$\{today\}:\$\{counter\}/);
  assert.match(funnel, /CHECKOUT_TIMING_COUNTER_SET\.has\(counter\)/);
  // Stage aggregates persist through the same writer, with the sum_ms
  // amount carried as the KV increment.
  assert.match(funnel, /export async function recordCheckoutTimingAggregateIncrements/);
  assert.match(funnel, /kv\.incr\(`checkout_timing:total:\$\{counter\}`, increment\)/);
  assert.match(funnel, /kv\.incr\(`checkout_timing:daily:\$\{today\}:\$\{counter\}`, increment,/);
});

test("source: checkout route emits checkout_timing and the timing counters, behaviour untouched", () => {
  const route = fs.readFileSync(CHECKOUT_ROUTE, "utf8");
  assert.match(route, /createCheckoutTimingCollector/);
  assert.match(route, /logCheckoutTiming/);
  // Counters are queued as events fire and flushed after the Stripe
  // stage is finalized, so KV latency never inflates measured stages.
  assert.match(route, /queueTimingCounter\("consent_fallback_fired"/);
  assert.match(route, /queueTimingCounter\("discount_fallback_fired"/);
  assert.match(route, /queueTimingCounter\("url_recovery_fired"/);
  assert.match(route, /flushQueuedTimingCounters/);
  assert.match(route, /recordCheckoutTimingCounter\(queued\.counter\)/);
  // stripeCreateMs is finalized on every error exit, and URL recovery
  // is marked when the retrieve is attempted, not only on success.
  assert.match(route, /finalizeStripeCreateMs/);
  assert.match(route, /checkoutTimingCounterForPrintfulQuoteBucket/);
  // The Stripe client configuration is untouched by the instrumentation.
  assert.match(route, /timeout: 20_000/);
  assert.match(route, /maxNetworkRetries: 2/);
});

test("source: stage aggregates are fire-and-forget at the timing log emit, Stripe create untouched", () => {
  const route = fs.readFileSync(CHECKOUT_ROUTE, "utf8");
  // The route-level emit wrapper persists the aggregates without
  // awaiting them (best-effort wrapper), and skips QA checkouts. The
  // promise is registered with the Workers execution context so the
  // runtime cannot cancel the KV writes when the response returns.
  assert.match(route, /const persistence = bestEffortCheckoutSideEffect\(\{\s+correlationId: input\.correlationId,\s+stage: "checkout_timing_stage_aggregates",\s+run: \(\) => recordCheckoutTimingAggregateIncrements\(increments\),\s+\}\)/);
  assert.match(route, /getCloudflareContext\(\)\.ctx\.waitUntil\(persistence\)/);
  assert.doesNotMatch(route, /await bestEffortCheckoutSideEffect\(\{\s+correlationId: input\.correlationId,\s+stage: "checkout_timing_stage_aggregates"/);
  assert.match(route, /checkoutTimingAggregateIncrements\(input\.collector, totalMs\)/);
  // The Stripe session create call site is byte-identical to the
  // pre-aggregate instrumentation: same callee, same params, same
  // idempotency-key option, exactly one direct create in the route.
  const createSnippet =
    "return stripe.checkout.sessions.create(params, key ? { idempotencyKey: key } : undefined);";
  assert.equal(
    route.split(createSnippet).length - 1,
    1,
    "exactly one direct Stripe create call site, unchanged",
  );
});
