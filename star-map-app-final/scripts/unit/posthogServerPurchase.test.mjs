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
