import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertPrintOrderRetained,
  buildPersistPrintOrderResult,
  classifyPrintOrderUnretainableReason,
  PrintOrderUnretainableError,
  simulateProviderSuccessThenDurableFailRetry,
  submitPrintfulOrderWithFetch,
} from "./printFulfillmentIdempotency.harness.mjs";
import {
  CLOUDFLARE_KV_MIN_EXPIRATION_TTL_SECONDS,
  DEFAULT_PRINT_ORDER_RETENTION_DAYS,
  resolvePrintOrderKvWrite,
} from "./printOrders.harness.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "../..");
const printfulSource = fs.readFileSync(path.join(appRoot, "src/lib/printful.ts"), "utf8");
const printOrdersSource = fs.readFileSync(path.join(appRoot, "src/lib/printOrders.ts"), "utf8");
const webhookSource = fs.readFileSync(path.join(appRoot, "src/app/api/stripe/webhook/route.ts"), "utf8");
const retrySource = fs.readFileSync(path.join(appRoot, "src/app/api/print/orders/retry/route.ts"), "utf8");

test("A: provider success then durable sent-write failure → retry reconciles, no second create", async () => {
  const existingOrderId = 424242;
  const fetchImpl = async (url, init = {}) => {
    const method = (init.method || "GET").toUpperCase();
    if (method === "POST") {
      return new Response(
        JSON.stringify({
          error: { api_error_code: "OR-1", message: "Order is no longer editable" },
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }
    if (method === "GET" && String(url).includes("/orders/@")) {
      return new Response(JSON.stringify({ result: { id: existingOrderId } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`unexpected ${method} ${url}`);
  };

  const { first, second, calls } = await simulateProviderSuccessThenDurableFailRetry(
    fetchImpl,
    "cs_test_reconcile_or1",
  );

  assert.equal(first.ok, true);
  assert.equal(first.orderId, existingOrderId);
  assert.equal(first.reconciled, true);
  assert.equal(second.ok, true);
  assert.equal(second.orderId, existingOrderId);
  assert.equal(second.reconciled, true);
  assert.equal(calls.post, 2);
  assert.equal(calls.get, 2);
  assert.equal(calls.createNew, 0, "must never mint a second Printful order");

  // Production must reconcile on OR-1 — never invent `${externalId}#${Date.now()}`.
  assert.doesNotMatch(printfulSource, /#\$\{Date\.now\(\)\}/);
  assert.match(printfulSource, /orders\/@/);
  assert.match(printfulSource, /reconciled:\s*true/);
  assert.match(printfulSource, /printful_order_exists_not_reconciled/);
  assert.match(printfulSource, /lookupOrderIdByExternalId|\/orders\/@/);
});

test("B: malformed durable record → provider creation blocked (fail closed)", () => {
  const plan = resolvePrintOrderKvWrite({ createdAt: "not-a-time", now: Date.now(), env: {} });
  assert.deepEqual(plan, { action: "delete" });
  const result = buildPersistPrintOrderResult(plan, "not-a-time");
  assert.deepEqual(result, {
    outcome: "deleted_unretainable",
    reason: "malformed_created_at",
  });
  assert.throws(() => assertPrintOrderRetained(result), PrintOrderUnretainableError);
  assert.equal(classifyPrintOrderUnretainableReason(null), "malformed_created_at");

  assert.match(printOrdersSource, /deleted_unretainable/);
  assert.match(printOrdersSource, /assertPrintOrderRetained/);
  assert.match(printOrdersSource, /PrintOrderUnretainableError/);
  assert.match(webhookSource, /assertPrintOrderRetained\(await persistPrintOrderRecord/);
  assert.match(webhookSource, /isPrintOrderUnretainableError\(error\)/);
  assert.match(webhookSource, /finalizing webhook without provider retry/);
  assert.match(
    webhookSource,
    /isPrintOrderUnretainableError\(error\)[\s\S]*?break;[\s\S]*?isDurableKvPersistenceError\(error\)[\s\S]*?completedCheckoutRetryable\s*=\s*true/,
  );
});

test("C: expired / insufficient-validity durable record → safe delete, no blind provider path", () => {
  const createdAt = 1_700_000_000_000;
  const deadlineMs = createdAt + DEFAULT_PRINT_ORDER_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const now = deadlineMs - 30_000; // 30s remaining < Workers KV min TTL
  const plan = resolvePrintOrderKvWrite({ createdAt, now, env: {} });
  assert.deepEqual(plan, { action: "delete" });
  assert.ok(30 < CLOUDFLARE_KV_MIN_EXPIRATION_TTL_SECONDS);
  const result = buildPersistPrintOrderResult(plan, createdAt);
  assert.deepEqual(result, {
    outcome: "deleted_unretainable",
    reason: "expired_or_below_min_ttl",
  });
  assert.throws(() => assertPrintOrderRetained(result), (error) => {
    assert.equal(error.code, "print_order_unretainable");
    assert.equal(error.reason, "expired_or_below_min_ttl");
    return true;
  });

  assert.match(retrySource, /assertPrintOrderRetained\(await persistPrintOrderRecord/);
  assert.match(retrySource, /isPrintOrderUnretainableError/);
  assert.match(retrySource, /status:\s*409/);
});

test("D: normal first fulfillment persists with provider-valid TTL", () => {
  const createdAt = Date.now();
  const plan = resolvePrintOrderKvWrite({ createdAt, now: createdAt, env: {} });
  assert.equal(plan.action, "persist");
  assert.ok(plan.ttlSeconds >= CLOUDFLARE_KV_MIN_EXPIRATION_TTL_SECONDS);
  const result = buildPersistPrintOrderResult(plan, createdAt);
  assert.equal(result.outcome, "persisted");
  assert.doesNotThrow(() => assertPrintOrderRetained(result));
  assert.match(printOrdersSource, /outcome:\s*"persisted"/);
  assert.match(printOrdersSource, /kv\.setDurable\(key,\s*record,\s*\{\s*ex:\s*plan\.ttlSeconds\s*\}\)/);
});

test("E: normal retry after durable success skips duplicate provider create (sent short-circuit)", () => {
  assert.match(webhookSource, /existing\?\.status === "sent"/);
  assert.match(retrySource, /existing\.status === "sent"/);
  assert.match(retrySource, /status:\s*"already_sent"/);
  // Pre-provider retainability gate on admin retry.
  assert.match(retrySource, /resolvePrintOrderKvWrite\(hydrated\.createdAt\)/);
  // After provider success, unretainable sent-writes index then finalize (no remint).
  assert.match(webhookSource, /durable record unretainable after provider success/);
  assert.match(webhookSource, /sentPersist\.outcome === "deleted_unretainable"/);
});

test("F: definitive provider failure before any order exists remains retryable", async () => {
  const fetchImpl = async (url, init = {}) => {
    const method = (init.method || "GET").toUpperCase();
    if (method === "POST") {
      return new Response(JSON.stringify({ error: { message: "temporary upstream failure" } }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`unexpected ${method} ${url}`);
  };

  const result = await submitPrintfulOrderWithFetch(fetchImpl, {
    externalId: "cs_test_provider_hard_fail",
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.reconciled, undefined);
  assert.match(String(result.error || ""), /temporary upstream failure|printful_order_failed/i);

  // Durable KV write failures remain Stripe-retryable (separate from unretainable).
  assert.match(webhookSource, /completedCheckoutRetryable\s*=\s*true/);
  assert.match(webhookSource, /isDurableKvPersistenceError\(error\)/);
});
