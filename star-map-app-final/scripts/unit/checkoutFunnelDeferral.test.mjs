import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import { bestEffortCheckoutSideEffect } from "../../src/lib/checkoutResilience.ts";

// Execute the actual handler tails, including Stripe-create (POST), cache writes,
// timing marks and response construction. Only external I/O is substituted.
const route = fs.readFileSync(new URL("../../src/app/api/checkout/route.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
function handlerTail(method) {
  const handler = route.indexOf(`export async function ${method}(`);
  const start = method === "GET"
    ? route.indexOf("    const postCreateStartedAt", handler)
    : route.lastIndexOf("    if (!qaContext.enabled)", route.indexOf('stage: "funnel_checkout_request_received"', handler));
  const end = route.indexOf("\n  } catch (err)", start);
  assert.ok(start > handler && end > start);
  const js = ts.transpileModule(`async function run() {\n${route.slice(start, end)}\n}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function("scope", `with (scope) { ${js}; return run(); }`);
}
const tails = { GET: handlerTail("GET"), POST: handlerTail("POST") };
const url = "https://checkout.stripe.com/c/pay/test_fixture";
function gate() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release };
}
async function completes(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("response awaited funnel")), 250); }),
    ]);
  } finally { clearTimeout(timer); }
}
function fixture(method, { orderType = "digital", handoff = "browser", discountRejected = false, qa = false, write = async () => {}, cacheWrite = async () => {}, contextAvailable = true } = {}) {
  const calls = [];
  const jobs = [];
  const cache = [];
  const session = { url, discountRejected };
  const scope = {
    performance, bestEffortCheckoutSideEffect,
    correlationId: "test-funnel", qaContext: { enabled: qa }, orderType,
    plan: "single", printVariant: "poster", checkoutHandoff: handoff, getCheckoutHandoff: handoff,
    timing: { startedAtPerf: performance.now() },
    logCheckoutTiming: () => {}, sessionResult: session,
    resolveStripeCheckoutHandoffUrl: () => ({ url }), isValidStripeCheckoutUrl: () => true,
    stripeCheckoutHtmlRedirectBody: (value) => `handoff:${value}`,
    NextResponse: class extends Response {
      static json(body, init) { return Response.json(body, init); }
    },
    recordFunnelStep: async (payload) => { calls.push(payload); await write(payload); },
    getCloudflareContext: () => {
      if (!contextAvailable) throw new Error("no_worker_context");
      return { ctx: { waitUntil(promise) { jobs.push(promise); } } };
    },
    createCheckoutSession: async () => session,
    kv: { set: async (...args) => { cache.push(args); await cacheWrite(); } },
    idempotencyKey: "checkout:test", CHECKOUT_IDEMPOTENCY_TTL_SECONDS: 600,
    selectedPromotion: { source: "none" }, promotion: { lookupFailed: false },
    shouldFallbackOnDiscountError: () => true,
    referral: {}, referralAttribution: null, referralAutoOffer: {},
    giftCertificate: false, isGift: false, promoCode: undefined, promoInvalidDropped: false,
  };
  for (const key of ["mapId", "resolvedPrintAssetId", "resolvedCardPrintAssetId", "includeDigitalAddOn", "includeCardAddOn", "includeSecondCopy", "shippingCountry", "clientCountry", "customerEmail", "merchFamily", "merchSize", "merchColor"]) scope[key] = undefined;
  return { calls, jobs, cache, run: () => tails[method](scope) };
}
function expected(method, orderType, handoff, discountRejected = false) {
  const steps = method === "GET" ? ["checkout_session_created", "checkout_redirected"]
    : ["checkout_request_received", "checkout_session_created", ...(discountRejected ? [] : ["checkout_redirected"])];
  return steps.map((step) => ({ step, source: `checkout_api_${orderType}_${method.toLowerCase()}`,
    plan: orderType === "print" ? "poster" : "single", handoff, trustedCheckoutClassification: true }));
}

for (const method of ["GET", "POST"]) {
  for (const orderType of ["digital", "print"]) {
    for (const handoff of ["browser", "missing"]) {
      test(`${method} ${orderType} ${handoff}: pending funnel does not delay response; waitUntil drains unchanged payloads`, async () => {
        const blocked = gate();
        const f = fixture(method, { orderType, handoff, write: () => blocked.promise });
        const responsePromise = f.run();
        try {
          const response = await completes(responsePromise);
          assert.equal(response.status, 200);
          assert.equal(f.jobs.length, method === "GET" ? 1 : 2);
          if (method === "GET") assert.equal(await response.text(), `handoff:${url}`);
          else { assert.equal((await response.json()).url, url); assert.equal(f.cache.length, 1); }
        } finally { blocked.release(); await responsePromise; await Promise.all(f.jobs); }
        assert.deepEqual(f.calls, expected(method, orderType, handoff));
      });
    }
  }
  test(`${method}: throwing funnel writes preserve response and continue subsequent steps`, async (t) => {
    t.mock.method(console, "warn", () => {});
    const normal = fixture(method);
    const broken = fixture(method, { write: () => { throw new Error("funnel failure"); } });
    const a = await normal.run(); const b = await broken.run();
    await Promise.all([...normal.jobs, ...broken.jobs]);
    assert.equal(b.status, a.status);
    assert.equal(await b.text(), await a.text());
    assert.deepEqual(broken.calls, normal.calls);
  });
  test(`${method}: QA still skips funnel persistence`, async () => {
    const f = fixture(method, { qa: true });
    assert.equal((await f.run()).status, 200);
    assert.deepEqual(f.calls, []); assert.deepEqual(f.jobs, []);
  });
  test(`${method}: absent Worker context awaits persistence instead of abandoning it`, async () => {
    const blocked = gate();
    const f = fixture(method, { contextAvailable: false, write: () => blocked.promise });
    let finished = false;
    const response = f.run().then((value) => { finished = true; return value; });
    try { await new Promise((resolve) => setImmediate(resolve)); assert.equal(finished, false); }
    finally { blocked.release(); }
    assert.equal((await response).status, 200);
    assert.deepEqual(f.calls, expected(method, "digital", "browser"));
    assert.deepEqual(f.jobs, []);
  });
}

for (const discountRejected of [false, true]) {
  test(`POST discountRejected=${discountRejected}: idempotency cache remains awaited while funnel is deferred`, async () => {
    const funnel = gate(); const cache = gate();
    const f = fixture("POST", { discountRejected, write: () => funnel.promise, cacheWrite: () => cache.promise });
    let finished = false;
    const response = f.run().then((value) => { finished = true; return value; });
    try {
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(f.cache.length, 1);
      assert.equal(finished, false);
      cache.release();
      const result = await completes(response);
      assert.equal(result.status, 200);
      const body = await result.json();
      assert.equal(body.url, url);
      assert.equal(body.discountRejected, discountRejected || undefined);
    } finally { cache.release(); funnel.release(); await response; await Promise.all(f.jobs); }
    assert.deepEqual(f.calls, expected("POST", "digital", "browser", discountRejected));
  });
}
