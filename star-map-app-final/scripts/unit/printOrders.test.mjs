import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  basePrintOrder,
  DEFAULT_PRINT_ORDER_RETENTION_DAYS,
  extractCheckoutPhoneFromStripeSession,
  getPrintOrderOpsSafeSummary,
  getPrintOrderRetentionSeconds,
  getPrintRecipient,
  normalizeCheckoutPhone,
  redactPrintOrderApiResponseText,
  sanitizePrintOrderForOperatorResponse,
} from "./printOrders.harness.mjs";

/** Distinctive synthetic phone — never a real customer value. */
const FIXTURE_PHONE = "+15555550199";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "../..");
const statusRouteSource = fs.readFileSync(
  path.join(appRoot, "src/app/api/print/orders/status/route.ts"),
  "utf8",
);
const retryRouteSource = fs.readFileSync(
  path.join(appRoot, "src/app/api/print/orders/retry/route.ts"),
  "utf8",
);
const resolveRouteSource = fs.readFileSync(
  path.join(appRoot, "src/app/api/print/orders/resolve/route.ts"),
  "utf8",
);
const retryScriptSource = fs.readFileSync(path.join(appRoot, "scripts/retry-print-order.mjs"), "utf8");
const privacyPageSource = fs.readFileSync(path.join(appRoot, "src/app/privacy/page.tsx"), "utf8");
const printOrdersSource = fs.readFileSync(path.join(appRoot, "src/lib/printOrders.ts"), "utf8");

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

test("sanitizePrintOrderForOperatorResponse strips phone from status/retry-shaped payloads", () => {
  const order = basePrintOrder({
    customerPhone: FIXTURE_PHONE,
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
  });
  const sanitized = sanitizePrintOrderForOperatorResponse(order);
  const serialized = JSON.stringify({ ok: true, order: sanitized });

  assert.equal(sanitized.hasCheckoutPhone, true);
  assert.equal("customerPhone" in sanitized, false);
  assert.equal(sanitized.shippingDetails?.phone, undefined);
  assert.doesNotMatch(serialized, /\+15555550199/);
  assert.doesNotMatch(serialized, /5555550199/);
  assert.doesNotMatch(serialized, /customerPhone/);
  // Recipient path still has phone for Printful submission.
  assert.equal(getPrintRecipient(order)?.phone, FIXTURE_PHONE);
});

test("redactPrintOrderApiResponseText protects retry-print-order.mjs terminal output", () => {
  const leaked = JSON.stringify({
    ok: true,
    order: basePrintOrder({
      customerPhone: FIXTURE_PHONE,
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
  });
  const redacted = redactPrintOrderApiResponseText(leaked);
  assert.doesNotMatch(redacted, /\+15555550199/);
  assert.doesNotMatch(redacted, /5555550199/);
  assert.doesNotMatch(redacted, /"customerPhone"\s*:\s*"/);
  const parsed = JSON.parse(redacted);
  assert.equal(parsed.order.hasCheckoutPhone, true);
  assert.equal(parsed.order.customerPhone, undefined);
});

test("print-order retention defaults to entitled-asset-aligned 60-day TTL", () => {
  assert.equal(DEFAULT_PRINT_ORDER_RETENTION_DAYS, 60);
  assert.equal(getPrintOrderRetentionSeconds({}), 60 * 24 * 60 * 60);
  assert.equal(getPrintOrderRetentionSeconds({ PRINT_ORDER_RETENTION_DAYS: "90" }), 90 * 24 * 60 * 60);
  assert.match(printOrdersSource, /persistPrintOrderRecord/);
  assert.match(printOrdersSource, /getPrintOrderRetentionSeconds/);
  assert.match(printOrdersSource, /DEFAULT_PRINT_ORDER_RETENTION_DAYS\s*=\s*60/);
});

test("production status/retry/resolve routes sanitize operator order responses", () => {
  assert.match(statusRouteSource, /sanitizePrintOrderForOperatorResponse\(order\)/);
  assert.doesNotMatch(statusRouteSource, /order,\s*marginPreview/);
  assert.match(retryRouteSource, /sanitizePrintOrderForOperatorResponse/);
  assert.match(retryRouteSource, /order:\s*sanitizePrintOrderForOperatorResponse\(/);
  assert.doesNotMatch(retryRouteSource, /order:\s*(updated|existing|failed|sent)\b/);
  assert.match(resolveRouteSource, /sanitizePrintOrderForOperatorResponse\(updated\)/);
  assert.match(resolveRouteSource, /persistPrintOrderRecord/);
});

test("retry-print-order.mjs redacts response bodies before terminal/job logs", () => {
  assert.match(retryScriptSource, /redactPrintOrderApiResponseText/);
  assert.match(retryScriptSource, /logResponseBody/);
  assert.doesNotMatch(retryScriptSource, /console\.log\(before\.text/);
  assert.doesNotMatch(retryScriptSource, /console\.log\(text\.slice/);
  assert.doesNotMatch(retryScriptSource, /console\.log\(after\.text/);
});

test("privacy page discloses print phone collection, Printful sharing, and retention", () => {
  assert.match(privacyPageSource, /Printful/);
  assert.match(privacyPageSource, /phone number/i);
  assert.match(privacyPageSource, /60 days/);
  assert.match(privacyPageSource, /physical print/i);
  assert.match(privacyPageSource, /carrier/i);
});
