import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { bestEffortCheckoutSideEffect } from "../../src/lib/checkoutResilience.ts";

// Execute the actual route closure with controlled I/O, without Stripe or KV.
const route = fs.readFileSync(new URL("../../src/app/api/checkout/route.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const start = route.indexOf("  const flushQueuedTimingCounters =");
const end = route.indexOf("\n\n  const normalizedOrderType", start);
assert.ok(start >= 0 && end > start);
const closure = route.slice(start, end).replace("async (): Promise<void>", "async ()");
const makeFlush = new Function(
  "queuedTimingCounters", "input", "bestEffortCheckoutSideEffect",
  "recordCheckoutTimingCounter", "getCloudflareContext",
  `${closure}\nreturn flushQueuedTimingCounters;`,
);

test("pending telemetry does not block checkout, persists in order, and drains once", async () => {
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const writes = [];
  const lifetimes = [];
  const queue = [
    { counter: "printful_quote_lt1s", stage: "quote" },
    { counter: "url_recovery_fired", stage: "recovery" },
  ];
  const flush = makeFlush(queue, {}, bestEffortCheckoutSideEffect, async (counter) => {
    writes.push(counter);
    await blocked;
  }, () => ({ ctx: { waitUntil: (promise) => lifetimes.push(promise) } }));
  try {
    // A bounded race makes the former awaited implementation fail without hanging.
    const completed = await Promise.race([
      flush().then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 100)),
    ]);
    assert.equal(completed, true);
    assert.deepEqual(writes, ["printful_quote_lt1s"]);
    assert.equal(lifetimes.length, 1);
    assert.equal(queue.length, 0);
    await flush();
    assert.equal(lifetimes.length, 1, "empty flush must not register another job");
  } finally {
    release();
    await Promise.all(lifetimes);
  }
  assert.deepEqual(writes, ["printful_quote_lt1s", "url_recovery_fired"]);
});

test("off-Workers context and failed counter writes preserve best-effort checkout", async (t) => {
  const warnings = [];
  t.mock.method(console, "warn", (...args) => warnings.push(args));
  const writes = [];
  const flush = makeFlush([
    { counter: "consent_fallback_fired", stage: "consent" },
    { counter: "discount_fallback_fired", stage: "discount" },
  ], {}, bestEffortCheckoutSideEffect, async (counter) => {
    writes.push(counter);
    throw new Error("simulated_kv_failure");
  }, () => { throw new Error("no_worker_context"); });
  await flush();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(writes, ["consent_fallback_fired", "discount_fallback_fired"]);
  assert.equal(warnings.length, 2);
});
