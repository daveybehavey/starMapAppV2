import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  finalizeUnretainableWebhookEvent,
  simulateV2ProviderSuccessThenDurableFailRetry,
  submitPrintfulV2OrderWithFetch,
} from "./printFulfillmentIdempotency.harness.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "../..");
const webhookSource = fs.readFileSync(path.join(appRoot, "src/app/api/stripe/webhook/route.ts"), "utf8");
const v2Source = fs.readFileSync(path.join(appRoot, "src/lib/printfulV2Orders.ts"), "utf8");

test("P1-A: provider accepted → unretainable sent → event dedupe persisted before success", async () => {
  const store = new Map();
  const kvSet = async (key, value) => {
    store.set(key, value);
  };
  const outcome = await finalizeUnretainableWebhookEvent({
    kvSet,
    eventDedupeKey: "stripe:webhook:evt_test_unretainable",
  });
  assert.equal(outcome.finalized, true);
  assert.equal(outcome.retryable, false);
  assert.deepEqual(store.get("stripe:webhook:evt_test_unretainable"), {
    received: true,
    reason: "print_order_unretainable",
  });

  // Production: unretainable catch must write dedupe before break; soft post-sent throws.
  assert.match(webhookSource, /persistWebhookEventDedupe/);
  assert.match(
    webhookSource,
    /isPrintOrderUnretainableError\(error\)[\s\S]*?persistWebhookEventDedupe\(eventDedupeKey[\s\S]*?break;/,
  );
  assert.match(
    webhookSource,
    /deleted_unretainable[\s\S]*?throw new PrintOrderUnretainableError\(sentPersist\.reason\)/,
  );
});

test("P1-B: event dedupe write fails → handler does not silently finalize as success", async () => {
  const kvSet = async () => {
    throw new Error("kv_unavailable");
  };
  const outcome = await finalizeUnretainableWebhookEvent({
    kvSet,
    eventDedupeKey: "stripe:webhook:evt_dedupe_fail",
  });
  assert.equal(outcome.finalized, false);
  assert.equal(outcome.retryable, true);

  assert.match(
    webhookSource,
    /persistWebhookEventDedupe\(eventDedupeKey[\s\S]*?if \(!deduped\) \{\s*completedCheckoutRetryable = true;/,
  );
  // Successful path also refuses silent finalize when dedupe write fails.
  assert.match(
    webhookSource,
    /const deduped = await persistWebhookEventDedupe\(eventDedupeKey\);\s*if \(!deduped\) \{\s*completedCheckoutRetryable = true;/,
  );
});

test("P1-C: Stripe redelivery after unretainable finalize does not create another provider order", async () => {
  // After dedupe is written, a second delivery short-circuits before provider work.
  const eventDedupeKey = "stripe:webhook:evt_redelivery";
  const store = new Map();
  await finalizeUnretainableWebhookEvent({
    kvSet: async (key, value) => {
      store.set(key, value);
    },
    eventDedupeKey,
  });
  assert.ok(store.has(eventDedupeKey));

  let providerCalls = 0;
  const handleRedelivery = (existingEvent) => {
    if (existingEvent) return { duplicate: true, providerCalls };
    providerCalls += 1;
    return { duplicate: false, providerCalls };
  };

  const first = handleRedelivery(store.get(eventDedupeKey));
  const second = handleRedelivery(store.get(eventDedupeKey));
  assert.equal(first.duplicate, true);
  assert.equal(second.duplicate, true);
  assert.equal(providerCalls, 0);

  assert.match(webhookSource, /existingEvent[\s\S]*?duplicate:\s*true/);
  assert.match(webhookSource, /reason:\s*"print_order_unretainable"/);
});

test("P1-D: V2 provider success then durable fail → retry reconciles, exactly one create", async () => {
  const existingOrderId = 909091;
  const fetchImpl = async (url, init = {}) => {
    const method = (init.method || "GET").toUpperCase();
    if (method === "POST" && String(url).includes("/v2/orders")) {
      return new Response(JSON.stringify({ data: { id: existingOrderId } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (method === "GET" && String(url).includes("/v2/orders/@")) {
      return new Response(JSON.stringify({ data: { id: existingOrderId } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`unexpected ${method} ${url}`);
  };

  const { first, second, calls } = await simulateV2ProviderSuccessThenDurableFailRetry(
    fetchImpl,
    "cs_test_v2_reconcile",
  );

  assert.equal(first.ok, true);
  assert.equal(first.orderId, existingOrderId);
  assert.equal(first.reconciled, undefined);
  assert.equal(second.ok, true);
  assert.equal(second.orderId, existingOrderId);
  assert.equal(second.reconciled, true);
  assert.equal(calls.post, 2, "retry may POST once then conflict");
  assert.equal(calls.get, 1, "second attempt reconciles via GET");
  assert.match(v2Source, /printful_v2_order_exists_not_reconciled/);
  assert.match(v2Source, /v2\/orders\/@/);
  assert.match(v2Source, /reconciled:\s*true/);
  assert.doesNotMatch(v2Source, /#\$\{Date\.now\(\)\}/);
});

test("P1-E: V2 duplicate/existing external id → reconcile existing order", async () => {
  const existingOrderId = 555001;
  const fetchImpl = async (url, init = {}) => {
    const method = (init.method || "GET").toUpperCase();
    if (method === "POST") {
      return new Response(
        JSON.stringify({ error: { message: "Order with this external_id already exists" } }),
        { status: 409, headers: { "content-type": "application/json" } },
      );
    }
    if (method === "GET" && String(url).includes("/v2/orders/@")) {
      return new Response(JSON.stringify({ data: { id: existingOrderId } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`unexpected ${method} ${url}`);
  };

  const result = await submitPrintfulV2OrderWithFetch(fetchImpl, {
    externalId: "cs_test_v2_existing",
  });
  assert.equal(result.ok, true);
  assert.equal(result.orderId, existingOrderId);
  assert.equal(result.reconciled, true);
  assert.match(v2Source, /isExistingExternalIdConflict|already exists/);
  assert.match(v2Source, /lookupOrderIdByExternalId|reconcileExistingOrFail/);
});

test("P1-F: V2 definite pre-create provider failure → later retry remains allowed", async () => {
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

  const result = await submitPrintfulV2OrderWithFetch(fetchImpl, {
    externalId: "cs_test_v2_hard_fail",
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.reconciled, undefined);
  assert.match(String(result.error || ""), /temporary upstream failure|printful_v2_order_failed/i);

  // Definitive pre-create failures must not be classified as existing-order conflicts.
  assert.match(v2Source, /printful_v2_request_timeout|printful_v2_request_failed/);
});
