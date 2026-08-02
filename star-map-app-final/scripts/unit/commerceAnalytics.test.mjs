import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMarketingAttributionMetadata,
  buildGa4MarketingParamsFromStripeMetadata,
  isQaStripeSession,
} from "../../src/lib/commerceAnalyticsQa.mjs";

test("isQaStripeSession detects qa metadata and legacy client_reference", () => {
  assert.equal(
    isQaStripeSession({
      metadata: { qa_run: "true", qa_source: "live_conversion_qa" },
      client_reference_id: "123e4567-e89b-42d3-a456-426614174000",
    }),
    true,
  );
  assert.equal(
    isQaStripeSession({
      metadata: {},
      client_reference_id: "qa-live-conversion",
    }),
    true,
  );
  assert.equal(
    isQaStripeSession({
      metadata: { map_id: "123e4567-e89b-42d3-a456-426614174000" },
      client_reference_id: "123e4567-e89b-42d3-a456-426614174000",
    }),
    false,
  );
  assert.equal(
    isQaStripeSession({
      metadata: {
        qa_run: "true",
        qa_source: "live_print_conversion_checkout_only",
      },
    }),
    true,
  );
  assert.equal(
    isQaStripeSession({
      metadata: {
        qa_ops_checkout: "true",
      },
    }),
    true,
  );
});

test("applyMarketingAttributionMetadata writes marketing_* keys", () => {
  const metadata = {};
  applyMarketingAttributionMetadata(metadata, {
    source: "google",
    medium: "cpc",
    campaign: "gift_wedding_2026",
    content: "wedding_star_map_gift",
  });
  assert.equal(metadata.marketing_source, "google");
  assert.equal(metadata.marketing_medium, "cpc");
  assert.equal(metadata.marketing_campaign, "gift_wedding_2026");
  assert.equal(metadata.marketing_content, "wedding_star_map_gift");
});

test("buildGa4MarketingParamsFromStripeMetadata maps checkout metadata", () => {
  const params = buildGa4MarketingParamsFromStripeMetadata({
    marketing_source: "google",
    marketing_medium: "cpc",
    marketing_campaign: "gift_wedding_2026",
    marketing_content: "wedding_gift_framed",
  });
  assert.deepEqual(params, {
    source: "google",
    medium: "cpc",
    campaign: "gift_wedding_2026",
    content: "wedding_gift_framed",
  });
});
