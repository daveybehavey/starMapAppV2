import assert from "node:assert/strict";
import test from "node:test";
import { requestCheckoutAttempt, shouldRetryCheckoutFailure } from "../../src/lib/checkoutClientFailure.ts";
import { redirectToStripeCheckout } from "../../src/lib/stripeCheckoutNavigation.ts";

test("transport normalizes network failures and preserves the exact request body", async (t) => {
  const bodies = [];
  const init = { method: "POST", body: JSON.stringify({ mapId: "same-map", plan: "single" }) };
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    bodies.push(options.body);
    if (bodies.length === 1) throw new TypeError("Failed to fetch");
    return Response.json({ url: "https://checkout.stripe.com/pay/cs_test_local" });
  });
  const first = await requestCheckoutAttempt(init);
  assert.equal(first.status, 0);
  assert.equal(first.data.code, "checkout_network_error");
  assert.equal(shouldRetryCheckoutFailure(first.data.code), true);
  const second = await requestCheckoutAttempt(init);
  assert.equal(second.ok, true);
  assert.deepEqual(bodies, [init.body, init.body]);
});

test("timeout aborts each attempt and always clears its timer", async (t) => {
  let abort;
  let clears = 0;
  t.mock.method(globalThis, "setTimeout", (callback, delay) => {
    assert.equal(delay, 30_000); abort = callback; return 123;
  });
  t.mock.method(globalThis, "clearTimeout", (timer) => { assert.equal(timer, 123); clears++; });
  t.mock.method(globalThis, "fetch", (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError")));
  }));
  for (let i = 0; i < 2; i++) {
    const pending = requestCheckoutAttempt({ method: "POST", body: "same" });
    abort();
    const result = await pending;
    assert.equal(result.data.code, "checkout_timeout");
    assert.equal(shouldRetryCheckoutFailure(result.data.code), true);
  }
  assert.equal(clears, 2);
});

test("HTTP input failures retain diagnostics and are not retried", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ code: "map_required", diagnosticId: "local-diagnostic" }, { status: 400 }));
  const result = await requestCheckoutAttempt({});
  assert.equal(result.status, 400);
  assert.equal(result.data.diagnosticId, "local-diagnostic");
  assert.equal(shouldRetryCheckoutFailure(result.data.code), false);
});

test("unexpected errors propagate and timers are still cleared", async (t) => {
  let cleared = false;
  t.mock.method(globalThis, "setTimeout", () => 123);
  t.mock.method(globalThis, "clearTimeout", () => { cleared = true; });
  t.mock.method(globalThis, "fetch", async () => { throw new Error("programming failure"); });
  await assert.rejects(requestCheckoutAttempt({}), /programming failure/);
  assert.equal(cleared, true);
});

test("browser handoff accepts recovered URLs with fragments and rejects unsafe origins", () => {
  const original = globalThis.window;
  const assigned = [];
  globalThis.window = { location: { assign: url => assigned.push(url) } };
  try {
    for (const url of ["https://checkout.stripe.com/pay/cs_test_local#fragment", "https://checkout.stripe.com/c/pay/cs_test_local"]) {
      redirectToStripeCheckout(url);
      assert.equal(assigned.at(-1), url);
    }
    for (const url of ["https://checkout.stripe.com.evil.example/pay/cs_test_local", "http://checkout.stripe.com/pay/cs_test_local", "https://user:pass@checkout.stripe.com/pay/cs_test_local"]) {
      assert.throws(() => redirectToStripeCheckout(url), /invalid_checkout_url/);
    }
    assert.equal(assigned.length, 2);
  } finally { globalThis.window = original; }
});
