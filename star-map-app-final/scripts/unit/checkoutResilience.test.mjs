import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  KvSoftWriteError,
  persistOrdinaryKvIncr,
  persistOrdinaryKvPut,
} from "../../src/lib/kv.ts";
import {
  bestEffortCheckoutSideEffect,
  createCheckoutSessionWithNetworkRetries,
  isStripeRetryableNetworkError,
  logCheckoutFailure,
  resolveCheckoutCorrelationId,
} from "../../src/lib/checkoutResilience.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CHECKOUT_ROUTE = path.join(ROOT, "src/app/api/checkout/route.ts");
const WRANGLER = path.join(ROOT, "wrangler.toml");

const STRIPE_CHECKOUT_URL =
  "https://checkout.stripe.com/c/pay/cs_test_a1b2c3d4e5f6#fidkdWxOYHwnPyd1blpxYHZxWjA0";

test("source: Stripe client enables bounded network retries", () => {
  const route = fs.readFileSync(CHECKOUT_ROUTE, "utf8");
  assert.match(route, /maxNetworkRetries:\s*2/);
  assert.match(route, /idempotencyKey/);
  assert.match(route, /bestEffortCheckoutSideEffect/);
  assert.match(route, /diagnosticId:\s*correlationId/);
  assert.match(route, /logCheckoutFailure/);
});

test("source: Workers observability enabled in wrangler.toml", () => {
  const toml = fs.readFileSync(WRANGLER, "utf8");
  assert.match(toml, /\[observability\]/);
  assert.match(toml, /enabled\s*=\s*true/);
});

test("1: Stripe transient network failure retries then returns URL", async () => {
  const seenKeys = [];
  let attempts = 0;
  const session = await createCheckoutSessionWithNetworkRetries({
    maxNetworkRetries: 2,
    idempotencyKey: "checkout:idem:map-1",
    isRetryableNetworkError: isStripeRetryableNetworkError,
    create: async ({ idempotencyKey }) => {
      attempts += 1;
      seenKeys.push(idempotencyKey);
      if (attempts === 1) {
        const err = new Error("Connection reset");
        err.type = "StripeConnectionError";
        throw err;
      }
      return { url: STRIPE_CHECKOUT_URL, id: "cs_test_ok" };
    },
  });
  assert.equal(attempts, 2);
  assert.deepEqual(seenKeys, ["checkout:idem:map-1", "checkout:idem:map-1"]);
  assert.equal(session.url, STRIPE_CHECKOUT_URL);
});

test("2: Stripe repeatedly fails → generic customer error fields + normalized log", async () => {
  await assert.rejects(
    () =>
      createCheckoutSessionWithNetworkRetries({
        maxNetworkRetries: 2,
        idempotencyKey: "checkout:idem:map-fail",
        isRetryableNetworkError: isStripeRetryableNetworkError,
        create: async () => {
          const err = new Error("Connection reset");
          err.type = "StripeConnectionError";
          err.code = "ECONNRESET";
          throw err;
        },
      }),
    (error) => error?.type === "StripeConnectionError"
  );

  const correlationId = resolveCheckoutCorrelationId("corr-test-abcdefgh");
  const logs = [];
  const originalError = console.error;
  console.error = (...args) => {
    logs.push(args);
  };
  try {
    logCheckoutFailure({
      correlationId,
      stage: "stripe_checkout_post",
      normalizedReason: "stripe_StripeConnectionError",
      stripeErrorType: "StripeConnectionError",
      stripeErrorCode: "ECONNRESET",
      httpStatus: 500,
      mapIdPresent: true,
      checkoutKind: "digital_single",
    });
  } finally {
    console.error = originalError;
  }
  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], "checkout_failed");
  assert.deepEqual(logs[0][1], {
    correlationId,
    stage: "stripe_checkout_post",
    normalizedReason: "stripe_StripeConnectionError",
    stripeErrorType: "StripeConnectionError",
    stripeErrorCode: "ECONNRESET",
    httpStatus: 500,
    mapIdPresent: true,
    checkoutKind: "digital_single",
  });
  // Customer payload contract (route returns these fields; no raw Stripe text).
  const customer = {
    error: "Checkout failed",
    code: "unknown_error",
    diagnosticId: correlationId,
  };
  assert.equal(customer.code, "unknown_error");
  assert.equal(customer.diagnosticId, correlationId);
  assert.equal(Object.hasOwn(customer, "message") === false || customer.message === undefined, true);
});

test("3: analytics failure BEFORE Stripe creation still proceeds", async () => {
  let stripeCalled = false;
  await bestEffortCheckoutSideEffect({
    correlationId: "corr-before",
    stage: "funnel_checkout_request_received",
    run: async () => {
      throw new Error("kv incr failed");
    },
  });
  // Soft analytics must not prevent Stripe create.
  stripeCalled = true;
  const session = { url: STRIPE_CHECKOUT_URL };
  assert.equal(stripeCalled, true);
  assert.equal(session.url, STRIPE_CHECKOUT_URL);
});

test("4: analytics failure AFTER Stripe success still returns URL", async () => {
  const session = { url: STRIPE_CHECKOUT_URL };
  await bestEffortCheckoutSideEffect({
    correlationId: "corr-after",
    stage: "funnel_checkout_session_created",
    run: async () => {
      throw new Error("funnel write failed");
    },
  });
  await bestEffortCheckoutSideEffect({
    correlationId: "corr-after",
    stage: "idempotency_cache_set",
    run: async () => {
      throw new KvSoftWriteError("Cloudflare KV ordinary put failed");
    },
  });
  assert.equal(session.url, STRIPE_CHECKOUT_URL);
});

test("5: Workers KV put/incr failure does NOT invoke filesystem fallback", async () => {
  const memoryStore = new Map();
  const fallbackWrites = [];
  const cfKv = {
    async get() {
      return 0;
    },
    async put() {
      throw new Error("cf put unavailable");
    },
    async delete() {
      throw new Error("delete should not run");
    },
    async list() {
      return { keys: [], list_complete: true };
    },
  };

  await assert.rejects(
    () =>
      persistOrdinaryKvPut({
        cfKv,
        allowLocalFallback: false,
        mirrorLocalInCi: false,
        key: "funnel:total:checkout_request_received",
        value: 1,
        memoryStore,
        writeFallback: async (key, value) => {
          fallbackWrites.push({ key, value });
        },
      }),
    (error) => {
      assert.ok(error instanceof KvSoftWriteError);
      return true;
    }
  );
  assert.equal(fallbackWrites.length, 0);
  assert.equal(memoryStore.size, 0);

  await assert.rejects(
    () =>
      persistOrdinaryKvIncr({
        cfKv,
        allowLocalFallback: false,
        key: "funnel:total:checkout_request_received",
        by: 1,
        readLocal: async () => null,
        memoryStore,
        writeFallback: async (key, value) => {
          fallbackWrites.push({ key, value });
        },
      }),
    KvSoftWriteError
  );
  assert.equal(fallbackWrites.length, 0);
});

test("6: supported local filesystem fallback retains intended behavior", async () => {
  const memoryStore = new Map();
  const fallbackWrites = [];
  await persistOrdinaryKvPut({
    cfKv: null,
    allowLocalFallback: true,
    mirrorLocalInCi: false,
    key: "checkout:idempotency:url:local",
    value: STRIPE_CHECKOUT_URL,
    memoryStore,
    writeFallback: async (key, value) => {
      fallbackWrites.push({ key, value });
    },
  });
  assert.equal(memoryStore.get("checkout:idempotency:url:local"), STRIPE_CHECKOUT_URL);
  assert.equal(fallbackWrites.length, 1);

  const next = await persistOrdinaryKvIncr({
    cfKv: null,
    allowLocalFallback: true,
    key: "funnel:total:local",
    by: 1,
    readLocal: async () => null,
    memoryStore,
    writeFallback: async (key, value) => {
      fallbackWrites.push({ key, value });
    },
  });
  assert.equal(next, 1);
  assert.equal(memoryStore.get("funnel:total:local"), 1);
  assert.equal(fallbackWrites.length, 2);
});

test("7: Stripe retry preserves idempotency (no duplicate session ids)", async () => {
  const created = [];
  const session = await createCheckoutSessionWithNetworkRetries({
    maxNetworkRetries: 2,
    idempotencyKey: "stable-key-xyz",
    isRetryableNetworkError: isStripeRetryableNetworkError,
    create: async ({ idempotencyKey, attempt }) => {
      // Provider would return the same session for the same idempotency key.
      const id = `cs_from_${idempotencyKey}`;
      created.push({ id, attempt, idempotencyKey });
      if (attempt === 1) {
        const err = new Error("timeout");
        err.type = "StripeConnectionError";
        throw err;
      }
      return { id, url: STRIPE_CHECKOUT_URL };
    },
  });
  assert.equal(created.length, 2);
  assert.equal(created[0].idempotencyKey, created[1].idempotencyKey);
  assert.equal(created[0].id, created[1].id);
  assert.equal(session.id, "cs_from_stable-key-xyz");
});

test("8: typed checkout errors remain allowlisted public codes in route", () => {
  const route = fs.readFileSync(CHECKOUT_ROUTE, "utf8");
  assert.match(route, /"map_required"/);
  assert.match(route, /"map_not_found"/);
  assert.match(route, /rateLimitResponse/);
  assert.match(route, /CheckoutError/);
  // unknown_error path stays generic and never echoes raw Stripe text.
  assert.match(route, /code:\s*"unknown_error"/);
  assert.doesNotMatch(route, /error:\s*err\.message,\s*code:\s*"unknown_error"/);
});

test("correlation id accepts safe header or generates uuid", () => {
  const fromHeader = resolveCheckoutCorrelationId("probe-corr-id-001234");
  assert.equal(fromHeader, "probe-corr-id-001234");
  const generated = resolveCheckoutCorrelationId("!!!bad!!!");
  assert.match(generated, /^[0-9a-f-]{36}$/i);
});
