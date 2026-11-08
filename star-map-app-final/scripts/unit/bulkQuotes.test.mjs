/**
 * bulkQuotes.ts — pure validation / key / label seams for bulk-event quotes.
 *
 * Regression targets:
 * - happy-path parse normalizes email and applies enum defaults
 * - quantity / versionCount bounds and version_count_exceeds_quantity
 * - invalid / missing required fields map to stable error codes
 * - key + IP hash helpers stay deterministic; labels cover every enum
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const {
  BULK_QUOTE_KEY_PREFIX,
  BULK_QUOTE_ORDER_TYPES,
  BULK_QUOTE_FORMATS,
  BULK_QUOTE_BRANDING_OPTIONS,
  bulkQuoteKey,
  hashClientIp,
  isBulkOrdersEnabled,
  getBulkQuoteSupportEmail,
  getBulkQuoteOrderTypeLabel,
  getBulkQuoteFormatLabel,
  getBulkQuoteBrandingLabel,
  parseBulkQuoteInput,
} = await import("../../src/lib/bulkQuotes.ts");

function validPayload(overrides = {}) {
  return {
    name: "  Ada Lovelace  ",
    email: "Ada@Example.COM",
    organization: " Analytical Engines ",
    orderType: "corporate",
    quantity: 50,
    versionCount: 2,
    eventDates: "2026-12-01",
    mapLocation: "London, UK",
    preferredFormat: "framed",
    sizePreference: "18x18",
    deliveryDeadline: "2026-11-20",
    shippingDestination: "Toronto, CA",
    brandingRequest: "subtle_logo",
    notes: "Include logo on mat.",
    source: "ops-form",
    ...overrides,
  };
}

test("parseBulkQuoteInput: happy path normalizes email and trims fields", () => {
  const result = parseBulkQuoteInput(validPayload());
  assert.equal(result.ok, true);
  assert.equal(result.value.name, "Ada Lovelace");
  assert.equal(result.value.email, "ada@example.com");
  assert.equal(result.value.organization, "Analytical Engines");
  assert.equal(result.value.orderType, "corporate");
  assert.equal(result.value.quantity, 50);
  assert.equal(result.value.versionCount, 2);
  assert.equal(result.value.preferredFormat, "framed");
  assert.equal(result.value.brandingRequest, "subtle_logo");
  assert.equal(result.value.source, "ops-form");
});

test("parseBulkQuoteInput: empty/missing enums fall back; invalid enums error", () => {
  const fallbacks = parseBulkQuoteInput(
    validPayload({ orderType: "", preferredFormat: "   ", brandingRequest: undefined }),
  );
  assert.equal(fallbacks.ok, true);
  assert.equal(fallbacks.value.orderType, "corporate");
  assert.equal(fallbacks.value.preferredFormat, "unframed");
  assert.equal(fallbacks.value.brandingRequest, "none");

  const badType = parseBulkQuoteInput(validPayload({ orderType: "not-a-type" }));
  assert.equal(badType.ok, false);
  assert.equal(badType.error, "invalid_order_type");
});

test("parseBulkQuoteInput: quantity and versionCount bounds + exceed rule", () => {
  assert.equal(parseBulkQuoteInput(validPayload({ quantity: 24 })).error, "invalid_quantity");
  assert.equal(parseBulkQuoteInput(validPayload({ quantity: 5001 })).error, "invalid_quantity");
  assert.equal(parseBulkQuoteInput(validPayload({ versionCount: 0 })).error, "invalid_version_count");
  assert.equal(
    parseBulkQuoteInput(validPayload({ quantity: 25, versionCount: 26 })).error,
    "version_count_exceeds_quantity",
  );
  const edge = parseBulkQuoteInput(validPayload({ quantity: 25, versionCount: 25 }));
  assert.equal(edge.ok, true);
  assert.equal(edge.value.quantity, 25);
  assert.equal(edge.value.versionCount, 25);
});

test("parseBulkQuoteInput: rejects non-object payload and required-field failures", () => {
  assert.equal(parseBulkQuoteInput(null).error, "invalid_payload");
  assert.equal(parseBulkQuoteInput("x").error, "invalid_payload");
  assert.equal(parseBulkQuoteInput(validPayload({ name: "   " })).error, "invalid_name");
  assert.equal(parseBulkQuoteInput(validPayload({ email: "not-an-email" })).error, "invalid_email");
  assert.equal(parseBulkQuoteInput(validPayload({ eventDates: "" })).error, "invalid_event_dates");
  assert.equal(parseBulkQuoteInput(validPayload({ mapLocation: "" })).error, "invalid_map_location");
  assert.equal(
    parseBulkQuoteInput(validPayload({ shippingDestination: "" })).error,
    "invalid_shipping_destination",
  );
});

test("bulkQuoteKey + hashClientIp are deterministic prefixes/digests", () => {
  assert.equal(bulkQuoteKey("abc"), `${BULK_QUOTE_KEY_PREFIX}abc`);
  const a = hashClientIp("203.0.113.10");
  const b = hashClientIp("203.0.113.10");
  const c = hashClientIp("203.0.113.11");
  assert.equal(a, b);
  assert.equal(a.length, 16);
  assert.notEqual(a, c);
});

test("labels cover every declared enum; feature flag + support email env edges", () => {
  for (const value of BULK_QUOTE_ORDER_TYPES) {
    assert.equal(typeof getBulkQuoteOrderTypeLabel(value), "string");
    assert.ok(getBulkQuoteOrderTypeLabel(value).length > 0);
  }
  for (const value of BULK_QUOTE_FORMATS) {
    assert.ok(getBulkQuoteFormatLabel(value).length > 0);
  }
  for (const value of BULK_QUOTE_BRANDING_OPTIONS) {
    assert.ok(getBulkQuoteBrandingLabel(value).length > 0);
  }

  const savedBulk = process.env.BULK_EVENT_ORDERS_ENABLED;
  const savedEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
  try {
    delete process.env.BULK_EVENT_ORDERS_ENABLED;
    assert.equal(isBulkOrdersEnabled(), false);
    process.env.BULK_EVENT_ORDERS_ENABLED = "YES";
    assert.equal(isBulkOrdersEnabled(), true);
    process.env.BULK_EVENT_ORDERS_ENABLED = "0";
    assert.equal(isBulkOrdersEnabled(), false);

    delete process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
    assert.equal(getBulkQuoteSupportEmail(), "support@starmapco.com");
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL = "  ops@example.test  ";
    assert.equal(getBulkQuoteSupportEmail(), "ops@example.test");
  } finally {
    if (savedBulk === undefined) delete process.env.BULK_EVENT_ORDERS_ENABLED;
    else process.env.BULK_EVENT_ORDERS_ENABLED = savedBulk;
    if (savedEmail === undefined) delete process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
    else process.env.NEXT_PUBLIC_SUPPORT_EMAIL = savedEmail;
  }
});
