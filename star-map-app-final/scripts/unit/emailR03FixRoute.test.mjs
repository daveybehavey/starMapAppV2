import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./tsAliasLoader.mjs", import.meta.url);
register("./consistencyCoordinator.hooks.mjs", import.meta.url);
register("./dl1S4NextServer.hooks.mjs", import.meta.url);
register("./editorRenderEconomics.loader.mjs", import.meta.url);
process.env.STARMAP_CONSISTENCY_COORDINATOR_LOCAL = "1";
process.env.STARMAP_KV_ALLOW_LOCAL = "1";
const { NextRequest } = await import("next/server");
const { POST } = await import("../../src/app/api/promotions/consent-request/route.ts");
const { kv } = await import("../../src/lib/kv.ts");
const clients = await import("../../src/lib/consistencyCoordinator.ts");
const { RD_K_DISCLOSURE } = await import("../../src/lib/promotionDisclosure.ts");
const { PROMOTION_SIGNUP_MESSAGES, parsePromotionSignupStatus } = await import("../../src/lib/promotionSignupStatus.ts");
const React = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { default: PromotionSignup } = await import("../../src/components/PromotionSignup.tsx");

function request({ accept = "text/html,application/xhtml+xml", referer = "https://example.test/", invalid = false, malformed = false } = {}) {
  const body = new URLSearchParams({
    email: "route-test@example.test", consent: invalid ? "no" : "yes",
    disclosureVersion: RD_K_DISCLOSURE.version, disclosureHash: RD_K_DISCLOSURE.hash,
  });
  return new NextRequest("https://example.test/api/promotions/consent-request", {
    method: "POST", headers: { accept, referer, ...(malformed ? { "content-type": "text/plain" } : {}) },
    body: malformed ? "invalid" : body,
  });
}

async function withFakes(scenario, run) {
  clients.__resetConsistencyCoordinatorMemoryForTests();
  const saved = { incr: kv.incr, get: kv.get, fetch: globalThis.fetch };
  kv.incr = async () => scenario === "rate_limited" ? 11 : 1;
  kv.get = async () => {
    if (scenario === "capture_unavailable") throw new Error("synthetic unavailable");
    return null;
  };
  globalThis.fetch = async () => { throw new Error("network forbidden"); };
  try { await run(); } finally { kv.incr = saved.incr; kv.get = saved.get; globalThis.fetch = saved.fetch; }
}

for (const scenario of ["pending", "error", "rate_limited", "capture_unavailable"]) {
  for (const page of ["/", "/editor"]) {
    test(`FIX-2: browser ${scenario} returns 303 to ${page} with the existing promo contract`, async () => {
      await withFakes(scenario, async () => {
        const response = await POST(request({ invalid: scenario === "error", referer: `https://example.test${page}?mode=quick&promo=success&code=STALE` }));
        assert.equal(response.status, 303);
        const target = new URL(response.headers.get("location"));
        assert.equal(target.origin, "https://example.test");
        assert.equal(target.pathname, page);
        assert.equal(target.searchParams.get("promo"), scenario);
        assert.equal(target.searchParams.get("mode"), "quick");
        assert.equal(target.searchParams.has("code"), false);
        assert.equal(parsePromotionSignupStatus(target.searchParams.get("promo")), scenario);
      });
    });
  }
  test(`FIX-2: API ${scenario} retains JSON and its HTTP status`, async () => {
    await withFakes(scenario, async () => {
      const response = await POST(request({ accept: "application/json", invalid: scenario === "error" }));
      assert.equal(response.status, { pending: 200, error: 400, rate_limited: 429, capture_unavailable: 503 }[scenario]);
      assert.match(response.headers.get("content-type"), /application\/json/);
      assert.equal(response.headers.has("location"), false);
      const json = await response.json();
      if (scenario === "pending") assert.deepEqual(json, { ok: true, status: "pending", message: PROMOTION_SIGNUP_MESSAGES.pending });
      if (scenario === "error") assert.deepEqual(json, { error: "fresh_consent_required" });
      if (scenario === "rate_limited") { assert.equal(json.code, "rate_limited"); assert.ok(response.headers.get("retry-after")); }
      if (scenario === "capture_unavailable") assert.deepEqual(json, { error: "capture_unavailable" });
    });
  });
}

test("FIX-2: malformed browser form redirects with error; API keeps invalid_request JSON", async () => {
  await withFakes("error", async () => {
    const browser = await POST(request({ malformed: true }));
    assert.equal(browser.status, 303);
    assert.equal(new URL(browser.headers.get("location")).searchParams.get("promo"), "error");
    const api = await POST(request({ malformed: true, accept: "application/json" }));
    assert.equal(api.status, 400);
    assert.deepEqual(await api.json(), { error: "invalid_request" });
  });
});

test("FIX-2: unsafe, missing, and non-storefront referrers fall back to home", async () => {
  await withFakes("pending", async () => {
    for (const referer of ["https://external.test/editor", "", "bad-url", "https://example.test/api/promotions/consent-request"]) {
      const response = await POST(request({ referer }));
      assert.equal(response.headers.get("location"), "https://example.test/?promo=pending");
    }
  });
});

test("FIX-2: unspecified Accept remains an API JSON response", async () => {
  await withFakes("pending", async () => {
    const response = await POST(request({ accept: "*/*" }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "pending");
  });
});

test("FIX-2: pending and failure form feedback renders truthfully without a success/code claim", () => {
  for (const status of ["pending", "error", "rate_limited", "capture_unavailable"]) {
    const html = renderToStaticMarkup(React.createElement(PromotionSignup, { promoStatus: status, promoCode: "STALE" }));
    assert.ok(html.includes(PROMOTION_SIGNUP_MESSAGES[status].replaceAll("'", "&#x27;")));
    assert.doesNotMatch(html, /You're on the list|You&#x27;re on the list|STALE/);
    assert.match(html, /method="POST"/);
  }
});
