import assert from "node:assert/strict";
import test from "node:test";
import { buildPosthogPurchaseProperties } from "../../src/lib/posthogServerPurchase.ts";

test("buildPosthogPurchaseProperties maps Stripe session fields", () => {
  const props = buildPosthogPurchaseProperties({
    transactionId: "cs_live_test123",
    plan: "single",
    orderType: "print",
    printVariant: "poster_framed",
    includeDigitalAddOn: true,
    value: 106,
    currency: "usd",
  });
  assert.equal(props.transaction_id, "cs_live_test123");
  assert.equal(props.revenue, 106);
  assert.equal(props.value, 106);
  assert.equal(props.currency, "USD");
  assert.equal(props.order_type, "print");
  assert.equal(props.plan, "single");
  assert.equal(props.print_variant, "poster_framed");
  assert.equal(props.include_digital_add_on, true);
  assert.equal(props.server_side, true);
  assert.equal(props.source, "stripe_webhook");
});

test("purchase preserves campaign attribution separately from capture source", () => {
  const props = buildPosthogPurchaseProperties({
    transactionId: "fixture-purchase",
    value: 13,
    currency: "cad",
    source: "pinterest",
    medium: "organic_social",
    campaign: "holiday_gifts_202611",
    content: "luxury_clean_r74",
  });
  assert.equal(props.source, "stripe_webhook");
  assert.equal(props.marketing_source, "pinterest");
  assert.equal(props.marketing_medium, "organic_social");
  assert.equal(props.marketing_campaign, "holiday_gifts_202611");
  assert.equal(props.marketing_content, "luxury_clean_r74");
});

test("unattributed purchases do not invent campaign properties", () => {
  for (const attribution of [{}, { source: "", medium: "", campaign: "", content: "" }]) {
    const props = buildPosthogPurchaseProperties({ transactionId: "fixture-direct", ...attribution });
    for (const key of ["marketing_source", "marketing_medium", "marketing_campaign", "marketing_content"]) {
      assert.equal(Object.hasOwn(props, key), false);
    }
    assert.equal(props.source, "stripe_webhook");
  }
});
