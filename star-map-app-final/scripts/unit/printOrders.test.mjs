import assert from "node:assert/strict";
import test from "node:test";
import {
  basePrintOrder,
  extractCheckoutPhoneFromStripeSession,
  getPrintOrderOpsSafeSummary,
  getPrintRecipient,
  normalizeCheckoutPhone,
} from "./printOrders.harness.mjs";

/** Distinctive synthetic phone — never a real customer value. */
const FIXTURE_PHONE = "+15555550199";

test("normalizeCheckoutPhone keeps trimmed phone and rejects blank/non-string", () => {
  assert.equal(normalizeCheckoutPhone(`  ${FIXTURE_PHONE}  `), FIXTURE_PHONE);
  assert.equal(normalizeCheckoutPhone(""), null);
  assert.equal(normalizeCheckoutPhone("   "), null);
  assert.equal(normalizeCheckoutPhone(null), null);
  assert.equal(normalizeCheckoutPhone(undefined), null);
  assert.equal(normalizeCheckoutPhone(15555550199), null);
});

test("extractCheckoutPhoneFromStripeSession prefers customer_details.phone", () => {
  assert.equal(
    extractCheckoutPhoneFromStripeSession({
      customer_details: { phone: FIXTURE_PHONE },
      shipping_details: { phone: "+15555550000" },
    }),
    FIXTURE_PHONE,
  );
  assert.equal(
    extractCheckoutPhoneFromStripeSession({
      customer_details: { phone: null },
      shipping_details: { phone: FIXTURE_PHONE },
    }),
    FIXTURE_PHONE,
  );
  assert.equal(
    extractCheckoutPhoneFromStripeSession({
      customer_details: { phone: null },
      shipping_details: { phone: null },
    }),
    null,
  );
});

test("getPrintRecipient passes present checkout phone to Printful recipient", () => {
  const recipient = getPrintRecipient(
    basePrintOrder({
      customerPhone: FIXTURE_PHONE,
    }),
  );
  assert.ok(recipient);
  assert.equal(recipient.phone, FIXTURE_PHONE);
  assert.equal(recipient.city, "Austin");
  assert.equal(recipient.country_code, "US");
});

test("getPrintRecipient preserves absent phone as undefined (no invented fallback)", () => {
  const absentExplicit = getPrintRecipient(basePrintOrder({ customerPhone: null }));
  assert.ok(absentExplicit);
  assert.equal(absentExplicit.phone, undefined);

  const absentLegacy = getPrintRecipient(basePrintOrder({}));
  assert.ok(absentLegacy);
  assert.equal(absentLegacy.phone, undefined);

  const blank = getPrintRecipient(basePrintOrder({ customerPhone: "   " }));
  assert.ok(blank);
  assert.equal(blank.phone, undefined);
});

test("getPrintRecipient falls back to shippingDetails.phone when customerPhone absent", () => {
  const recipient = getPrintRecipient(
    basePrintOrder({
      customerPhone: null,
      shippingDetails: {
        name: "Test Buyer",
        phone: FIXTURE_PHONE,
        address: {
          line1: "123 Example St",
          city: "Austin",
          state: "TX",
          postal_code: "78701",
          country: "US",
        },
      },
    }),
  );
  assert.ok(recipient);
  assert.equal(recipient.phone, FIXTURE_PHONE);
});

test("getPrintRecipient still requires shipping address even when phone is present", () => {
  assert.equal(
    getPrintRecipient(
      basePrintOrder({
        customerPhone: FIXTURE_PHONE,
        shippingDetails: null,
      }),
    ),
    null,
  );
});

test("ops-safe summary redacts phone — no PII in logs/alert-shaped payloads", () => {
  const order = basePrintOrder({
    customerPhone: FIXTURE_PHONE,
    customerEmail: "buyer@example.test",
  });
  const recipient = getPrintRecipient(order);
  assert.equal(recipient?.phone, FIXTURE_PHONE);

  const safe = getPrintOrderOpsSafeSummary(order);
  const serialized = JSON.stringify(safe);

  assert.equal(safe.hasCheckoutPhone, true);
  assert.equal(safe.destination, "Austin, TX, US");
  assert.doesNotMatch(serialized, /\+15555550199/);
  assert.doesNotMatch(serialized, /5555550199/);
  assert.doesNotMatch(serialized, /buyer@example\.test/);
  assert.doesNotMatch(serialized, /123 Example St/);

  // Guard against accidental full-recipient snapshots in tests.
  assert.notDeepEqual(safe, recipient);
  assert.ok(!("phone" in safe));
  assert.ok(!("email" in safe));
  assert.ok(!("address1" in safe));
});
