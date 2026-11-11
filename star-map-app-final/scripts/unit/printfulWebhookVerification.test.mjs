import assert from "node:assert/strict";
import test, { beforeEach, after } from "node:test";
import { register } from "node:module";
import fs from "node:fs";
register("./tsAliasLoader.mjs", import.meta.url);
register("./printfulWebhookVerification.hooks.mjs", import.meta.url);
const { POST, GET } = await import("../../src/app/api/printful/webhook/route.ts");
const { calls } = await import("./printfulWebhookVerification.events.stub.mjs");
const originalFetch = globalThis.fetch;
const originalError = console.error;
const logs = [];
console.error = (...args) => logs.push(args);
after(() => { globalThis.fetch = originalFetch; console.error = originalError; });
let apiOrder;
let reads;
beforeEach(() => {
  process.env.PRINTFUL_WEBHOOK_SECRET = "throwaway-new";
  process.env.PRINTFUL_API_TOKEN = "throwaway-api";
  calls.length = 0;
  logs.length = 0;
  reads = [];
  apiOrder = { id: 123, external_id: "cs_test_truth", status: "pending", shipments: [] };
  globalThis.fetch = async (url, options) => {
    reads.push([url, options]);
    return Response.json({ code: 200, result: apiOrder });
  };
});
function request(type, { token = "throwaway-new", order = { id: 123 }, shipment, reason } = {}) {
  return {
    nextUrl: new URL(`https://example.invalid/api/printful/webhook?token=${token}`),
    headers: new Headers(),
    json: async () => ({ type, data: { order, shipment, reason } }),
  };
}
test("valid-token forged shipment with no API shipment cannot resolve, mutate or notify", async () => {
  const response = await POST(request("package_shipped", { shipment: { tracking_number: "forged" } }));
  assert.equal(response.status, 503);
  assert.deepEqual(calls, []);
  assert.equal(reads.length, 1);
  assert.equal(reads[0][1].cache, "no-store");
  assert.ok(reads[0][1].signal instanceof AbortSignal);
});
test("confirmed shipment uses API identity and tracking despite forged body fields", async () => {
  apiOrder.status = "fulfilled";
  apiOrder.shipments = [{ tracking_number: "api-tracking", tracking_url: "https://carrier.invalid/real", carrier: "API", service: "Ground" }];
  const response = await POST(request("package_shipped", { shipment: { tracking_number: "forged", tracking_url: "https://attacker.invalid" } }));
  assert.equal(response.status, 200);
  assert.deepEqual(calls[1], ["ship", "cs_test_truth", { trackingNumber: "api-tracking", trackingUrl: "https://carrier.invalid/real", carrier: "API Ground" }]);
});
for (const [type, status, apply] of [["order_failed", "failed", "fail"], ["order_canceled", "canceled", "fail"], ["order_put_hold", "onhold", "hold"]]) {
  test(`${type}: stale claim with pending API state cannot apply`, async () => {
    assert.equal((await POST(request(type))).status, 503);
    assert.deepEqual(calls, []);
  });
  test(`${type}: confirmed state applies API fields only`, async () => {
    apiOrder.status = status;
    assert.equal((await POST(request(type, { reason: "forged-reason" }))).status, 200);
    assert.deepEqual(calls, [[apply, { eventType: type, printfulOrderId: "123", externalId: "cs_test_truth", reason: null, orderStatus: status }]]);
  });
}
for (const type of ["package_shipped", "order_failed", "order_put_hold"]) {
  for (const mode of ["http", "timeout", "invalid-json"]) {
    test(`${type}: ${mode} returns retryable 503 without mutation`, async () => {
      globalThis.fetch = async () => {
        if (mode === "timeout") throw new DOMException("secret query?token=throwaway-new", "TimeoutError");
        return mode === "http" ? new Response("secret", { status: 500 }) : new Response("bad json");
      };
      assert.equal((await POST(request(type))).status, 503);
      assert.deepEqual(calls, []);
      assert.doesNotMatch(JSON.stringify(logs), /\?|throwaway|secret/);
    });
  }
}
for (const order of [{ id: 999 }, { id: 123, external_id: "cs_test_attacker" }]) {
  test(`mismatched order identity ${JSON.stringify(order)} never applies`, async () => {
    apiOrder.status = "failed";
    assert.equal((await POST(request("order_failed", { order }))).status, 503);
    assert.deepEqual(calls, []);
  });
}
test("external-only hint fetches by external ID and applies returned provider ID", async () => {
  apiOrder.status = "onhold";
  assert.equal((await POST(request("order_put_hold", { order: { external_id: "cs_test_truth" } }))).status, 200);
  assert.match(reads[0][0], /orders\/%40cs_test_truth$/);
  assert.equal(calls[0][1].printfulOrderId, "123");
});
test("rotation rejects old token for both methods before parsing; new and header GET work", async () => {
  const old = request("order_failed", { token: "throwaway-old" });
  old.json = () => { throw new Error("must not parse"); };
  assert.equal((await GET(old)).status, 401);
  assert.equal((await POST(old)).status, 401);
  assert.equal((await GET(request(""))).status, 200);
  const header = request("", { token: "" });
  header.headers.set("x-printful-token", "throwaway-new");
  assert.equal((await GET(header)).status, 200);
  assert.equal(reads.length, 0);
});
test("empty secret fails closed before parsing", async () => {
  delete process.env.PRINTFUL_WEBHOOK_SECRET;
  assert.equal((await GET(request(""))).status, 401);
  assert.equal((await POST(request("order_failed"))).status, 401);
  assert.deepEqual(calls, []);
});
test("valid auth malformed JSON is 400 and unknown events stay 200 without API reads", async () => {
  const req = request("");
  req.json = async () => { throw new SyntaxError("bad"); };
  assert.equal((await POST(req)).status, 400);
  assert.equal((await POST(request("unknown"))).status, 200);
  assert.equal(reads.length, 0);
});
test("missing API token and missing identity fail closed", async () => {
  delete process.env.PRINTFUL_API_TOKEN;
  assert.equal((await POST(request("order_failed"))).status, 503);
  assert.equal((await POST(request("order_failed", { order: {} }))).status, 503);
  assert.deepEqual(calls, []);
});
test("failure and cancellation statuses cannot confirm each other's event", async () => {
  apiOrder.status = "canceled";
  assert.equal((await POST(request("order_failed"))).status, 503);
  apiOrder.status = "failed";
  assert.equal((await POST(request("order_canceled"))).status, 503);
  assert.deepEqual(calls, []);
});
test("API envelope error with HTTP 200 cannot authorize state", async () => {
  globalThis.fetch = async () => Response.json({ code: 500, result: { ...apiOrder, status: "failed" } });
  assert.equal((await POST(request("order_failed"))).status, 503);
  assert.deepEqual(calls, []);
});
test("provider read aborts on its deadline with no mutation", async (t) => {
  const timeout = AbortSignal.timeout;
  t.mock.method(AbortSignal, "timeout", (ms) => {
    assert.equal(ms, 10_000);
    return timeout(5);
  });
  globalThis.fetch = async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  // AbortSignal's own timer is unref'd; keep this isolated test process alive.
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    assert.equal((await POST(request("order_put_hold"))).status, 503);
    assert.deepEqual(calls, []);
  } finally {
    clearTimeout(keepAlive);
  }
});
test("log policy excludes request URL and dynamic handler errors; platform invocation records disabled", () => {
  const source = fs.readFileSync(new URL("../../src/app/api/printful/webhook/route.ts", import.meta.url), "utf8");
  const warnings = source.match(/console\.warn\([^;]+;/g) || [];
  assert.ok(warnings.length > 0);
  for (const warning of warnings) {
    assert.match(warning, /path: "\/api\/printful\/webhook", outcome: "handler_warning"/);
    assert.doesNotMatch(warning, /req\.|payload\.|result\./);
  }
  const config = fs.readFileSync(new URL("../../wrangler.toml", import.meta.url), "utf8");
  assert.match(config, /\[observability.logs\][\s\S]*invocation_logs = false/);
});
