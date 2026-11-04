import { fork } from "node:child_process";
import path from "node:path";
import { test as base, expect, type APIRequestContext } from "@playwright/test";

// Run the real checkout handler in an isolated local server with the repo's
// ESM-loader Stripe-double pattern. Browser/API responses are never fabricated.
const test = base.extend<{ checkout: APIRequestContext }>({
  checkout: async ({ playwright }, provideCheckout) => {
    const child = fork(path.resolve("tests/fixtures/c14/server.mjs"), [], {
      env: { PATH: process.env.PATH, NODE_ENV: "test" },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    let logs = "";
    child.stdout?.on("data", (chunk) => { logs += chunk; });
    child.stderr?.on("data", (chunk) => { logs += chunk; });
    try {
      const port = await new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Fixture startup timeout: ${logs}`)), 15_000);
        child.once("message", (message: { port: number }) => { clearTimeout(timer); resolve(message.port); });
        child.once("exit", () => { clearTimeout(timer); reject(new Error(`Fixture exited: ${logs}`)); });
      });
      const request = await playwright.request.newContext({ baseURL: `http://127.0.0.1:${port}` });
      try { await provideCheckout(request); } finally { await request.dispose(); }
    } finally { child.kill(); }
  },
});

import { applySampleMoment, gotoEditor, mockGeocode } from "./test-helpers";

const mapId = "11111111-1111-4111-8111-111111111111";
const promoCode = "C14_FIXTURE";
const promotionId = "promo_c14_fixture";

for (const orderType of ["print", "digital"] as const) {
  for (const method of ["GET", "POST"] as const) {
    for (const reject of [false, true]) {
      test(`${method} ${orderType}: manual promo ${reject ? "rejection stops full-price fallback (#560)" : "is applied at session creation"}`, async ({ checkout }) => {
        await checkout.post("/__fixture", { data: { reject, orderType } });
        const response = method === "POST"
          ? await checkout.post("/api/checkout", { data: {
            mapId, checkoutHandoff: "b1111111111111111", printAssetId: mapId, plan: "single", orderType, promoCode, printVariant: "poster_framed", shippingCountry: "US",
          } })
          : await checkout.get("/api/checkout", { params: {
            map_id: mapId, checkout_handoff: "b1111111111111111", print_asset_id: mapId, plan: "single", order_type: orderType, promo_code: promoCode,
            print_variant: "poster_framed", shipping_country: "US", format: "json",
          }, maxRedirects: 0 });
        const text = await response.text();
        const body = response.headers()["content-type"]?.includes("application/json") ? JSON.parse(text) : {};
        const state = await (await checkout.get("/__fixture")).json();
        expect(state.lookups, JSON.stringify(body)).toHaveLength(1);
        expect(state.lookups[0]).toMatchObject({ code: promoCode, active: true });
        // A regression that retries without the discount must fail even if the
        // handler eventually returns an error. The stub would accept that retry.
        expect(state.calls, JSON.stringify(body)).toHaveLength(1);
        expect(state.calls[0].discounts).toEqual([{ promotion_code: promotionId }]);
        expect(state.calls[0].allow_promotion_codes).toBeUndefined();
        if (reject) {
          expect(response.status()).toBe(400);
          expect(body.code).toBe("promotion_not_applicable");
          expect(body.url).toBeUndefined();
          expect(response.headers().location).toBeUndefined();
        } else {
          expect(response.status()).toBe(200);
          if (method === "POST") expect(body.url).toBe("https://checkout.stripe.com/c/pay/cs_test_c14fixture");
          else expect(text).toContain("https://checkout.stripe.com/c/pay/cs_test_c14fixture");
          expect(state.calls[0].metadata.promotion_code_id).toBe(promotionId);
        }
      });
    }
  }
}

for (const reject of [false, true]) {
  test(`editor manual promo ${reject ? "shows rejection on-site (#560)" : "reaches discounted session creation"}`, async ({ page, checkout }) => {
    test.setTimeout(120_000);
    await checkout.post("/__fixture", { data: { reject, orderType: "digital" } });
    await mockGeocode(page);
    await page.route("**/api/maps", async (route) => {
      expect(route.request().method()).toBe("POST");
      const response = await checkout.post("/__map", { data: route.request().postDataJSON() });
      await route.fulfill({ response });
    });
    let checkoutRequests = 0;
    await page.route("**/api/checkout", async (route) => {
      checkoutRequests += 1;
      expect(route.request().postDataJSON().promoCode).toBe(promoCode);
      const response = await checkout.post("/api/checkout", { data: route.request().postDataJSON() });
      await route.fulfill({ response });
    });
    // Stop at the handoff; never load a real hosted payment page.
    await page.context().route("https://checkout.stripe.com/**", (route) => route.fulfill({ body: "C14 fixture checkout handoff" }));
    await gotoEditor(page, { query: { location: "Paris, France", lat: "48.8566", lon: "2.3522", date: "2024-06-15" } });
    await applySampleMoment(page);
    await page.getByLabel("HD export").first().click();
    await page.getByTestId("promotionCode-input").fill(promoCode);
    const responsePromise = page.waitForResponse("**/api/checkout");
    await page.getByRole("button", { name: "Buy this map in HD", exact: true }).click();
    const response = await responsePromise;
    if (reject) {
      expect(response.status()).toBe(400);
      expect((await response.json()).code).toBe("promotion_not_applicable");
      await expect(page.getByText("This code isn't valid for this item.", { exact: true })).toBeVisible();
      expect(new URL(page.url()).pathname).toBe("/editor");
    } else {
      expect(response.status()).toBe(200);
      await expect(page).toHaveURL("https://checkout.stripe.com/c/pay/cs_test_c14fixture");
    }
    expect(checkoutRequests).toBe(1);
    const state = await (await checkout.get("/__fixture")).json();
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0].discounts).toEqual([{ promotion_code: promotionId }]);
    expect(state.calls[0].allow_promotion_codes).toBeUndefined();
  });
}
