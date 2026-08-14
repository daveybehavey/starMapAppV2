import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  basePrintOrder,
  buildAlternateFulfillmentWebhookPayload,
  CLOUDFLARE_KV_MIN_EXPIRATION_TTL_SECONDS,
  DEFAULT_PRINT_ORDER_RETENTION_DAYS,
  extractCheckoutPhoneFromStripeSession,
  getPrintOrderOpsSafeSummary,
  getPrintOrderRetentionSeconds,
  getPrintRecipient,
  normalizeCheckoutPhone,
  redactPrintOrderApiResponseText,
  resolvePrintOrderCreatedAt,
  resolvePrintOrderKvWrite,
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
const webhookRouteSource = fs.readFileSync(
  path.join(appRoot, "src/app/api/stripe/webhook/route.ts"),
  "utf8",
);

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

test("print-order retention is fixed from creation and cannot exceed 60 days", () => {
  const DAY_SECONDS = 24 * 60 * 60;
  const DAY_MS = DAY_SECONDS * 1000;
  const createdAt = 1_700_000_000_000;

  assert.equal(DEFAULT_PRINT_ORDER_RETENTION_DAYS, 60);
  assert.equal(
    getPrintOrderRetentionSeconds({ createdAt, now: createdAt, env: {} }),
    60 * DAY_SECONDS,
  );
  assert.equal(
    getPrintOrderRetentionSeconds({
      createdAt,
      now: createdAt,
      env: { PRINT_ORDER_RETENTION_DAYS: "90" },
    }),
    60 * DAY_SECONDS,
  );
  assert.equal(
    getPrintOrderRetentionSeconds({
      createdAt,
      now: createdAt,
      env: { PRINT_ORDER_RETENTION_DAYS: "30" },
    }),
    30 * DAY_SECONDS,
  );
  assert.equal(
    getPrintOrderRetentionSeconds({ createdAt, now: createdAt + 50 * DAY_MS, env: {} }),
    10 * DAY_SECONDS,
  );
  assert.equal(
    getPrintOrderRetentionSeconds({ createdAt, now: createdAt + 61 * DAY_MS, env: {} }),
    0,
  );
  assert.equal(
    getPrintOrderRetentionSeconds({ createdAt: createdAt + DAY_MS, now: createdAt, env: {} }),
    60 * DAY_SECONDS,
  );
  assert.equal(getPrintOrderRetentionSeconds({ createdAt: Number.NaN, now: createdAt, env: {} }), 0);
  assert.equal(getPrintOrderRetentionSeconds({ createdAt: undefined, now: createdAt, env: {} }), 0);

  assert.match(printOrdersSource, /persistPrintOrderRecord/);
  assert.match(printOrdersSource, /resolvePrintOrderKvWrite\(record\.createdAt\)/);
  assert.match(printOrdersSource, /kv\.deleteDurable\(key\)/);
  assert.match(printOrdersSource, /DEFAULT_PRINT_ORDER_RETENTION_DAYS\s*=\s*60/);
  assert.match(printOrdersSource, /Math\.min\(configuredDays, DEFAULT_PRINT_ORDER_RETENTION_DAYS\)/);
  assert.match(printOrdersSource, /typeof createdAt !== "number"/);
  assert.match(printOrdersSource, /!Number\.isFinite\(createdAt\)/);
  assert.match(printOrdersSource, /CLOUDFLARE_KV_MIN_EXPIRATION_TTL_SECONDS\s*=\s*60/);
});

test("print-order KV write plan deletes below Workers min TTL and never extends deadline", () => {
  const DAY_SECONDS = 24 * 60 * 60;
  const createdAt = 1_700_000_000_000;
  const deadlineMs = createdAt + DEFAULT_PRINT_ORDER_RETENTION_DAYS * DAY_SECONDS * 1000;

  assert.equal(CLOUDFLARE_KV_MIN_EXPIRATION_TTL_SECONDS, 60);

  // Malformed => delete (no put / no invented TTL).
  for (const malformed of [null, undefined, Number.NaN, "bad", {}]) {
    assert.deepEqual(
      resolvePrintOrderKvWrite({ createdAt: malformed, now: createdAt, env: {} }),
      { action: "delete" },
    );
  }

  // Already expired => delete.
  assert.deepEqual(
    resolvePrintOrderKvWrite({ createdAt, now: deadlineMs + 1_000, env: {} }),
    { action: "delete" },
  );

  // 1–59s remaining => delete (must not put invalid TTL or pad to 60 past deadline).
  for (const remaining of [1, 30, 59]) {
    const now = deadlineMs - remaining * 1000;
    const plan = resolvePrintOrderKvWrite({ createdAt, now, env: {} });
    assert.deepEqual(plan, { action: "delete" }, `remaining=${remaining}s must delete`);
    assert.ok(now + CLOUDFLARE_KV_MIN_EXPIRATION_TTL_SECONDS * 1000 > deadlineMs);
  }

  // Exactly 60s remaining => persist with exact TTL.
  assert.deepEqual(
    resolvePrintOrderKvWrite({ createdAt, now: deadlineMs - 60_000, env: {} }),
    { action: "persist", ttlSeconds: 60 },
  );

  // >60s remaining => persist with exact remaining (capped by max window).
  assert.deepEqual(
    resolvePrintOrderKvWrite({ createdAt, now: deadlineMs - 120_000, env: {} }),
    { action: "persist", ttlSeconds: 120 },
  );
  assert.deepEqual(
    resolvePrintOrderKvWrite({ createdAt, now: createdAt, env: {} }),
    { action: "persist", ttlSeconds: DEFAULT_PRINT_ORDER_RETENTION_DAYS * DAY_SECONDS },
  );

  // Env may shorten but never extend past 60-day creation-anchored max.
  assert.deepEqual(
    resolvePrintOrderKvWrite({
      createdAt,
      now: createdAt,
      env: { PRINT_ORDER_RETENTION_DAYS: "90" },
    }),
    { action: "persist", ttlSeconds: 60 * DAY_SECONDS },
  );

  assert.match(printOrdersSource, /action === "delete"/);
  assert.match(printOrdersSource, /kv\.deleteDurable/);
  assert.doesNotMatch(printOrdersSource, /Math\.max\(1,\s*Math\.min\(maxRetentionSeconds/);
  assert.doesNotMatch(printOrdersSource, /ex:\s*getPrintOrderRetentionSeconds/);
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

test("duplicate prior record with malformed createdAt cannot receive a fresh retention window", () => {
  const now = 1_700_000_000_000;
  const malformedCases = [null, undefined, Number.NaN, "not-a-time", {}];

  for (const malformed of malformedCases) {
    const prior = basePrintOrder({ createdAt: malformed, status: "failed" });
    const resolved = resolvePrintOrderCreatedAt(prior, now);
    assert.equal(resolved, malformed, `must preserve malformed createdAt=${String(malformed)}`);
    assert.equal(
      getPrintOrderRetentionSeconds({ createdAt: resolved, now, env: {} }),
      0,
      `malformed createdAt must fail closed to 0 remaining; got value=${String(malformed)}`,
    );
    assert.deepEqual(
      resolvePrintOrderKvWrite({ createdAt: resolved, now, env: {} }),
      { action: "delete" },
      `malformed createdAt must durable-delete; got value=${String(malformed)}`,
    );
  }

  // Brand-new records (no prior) still mint now.
  assert.equal(resolvePrintOrderCreatedAt(null, now), now);
  assert.equal(resolvePrintOrderCreatedAt(undefined, now), now);
  assert.equal(
    getPrintOrderRetentionSeconds({ createdAt: resolvePrintOrderCreatedAt(null, now), now, env: {} }),
    60 * 24 * 60 * 60,
  );
  assert.deepEqual(
    resolvePrintOrderKvWrite({ createdAt: resolvePrintOrderCreatedAt(null, now), now, env: {} }),
    { action: "persist", ttlSeconds: 60 * 24 * 60 * 60 },
  );

  // Production webhook must not nullish-coalesce prior createdAt to Date.now().
  assert.match(webhookRouteSource, /resolvePrintOrderCreatedAt\(existing\)/);
  assert.doesNotMatch(webhookRouteSource, /createdAt:\s*existing\?\.createdAt\s*\?\?\s*Date\.now\(\)/);
  assert.match(printOrdersSource, /resolvePrintOrderCreatedAt/);
  assert.match(printOrdersSource, /typeof createdAt !== "number"/);
});

test("alternate fulfillment webhook omits phone on initial and retry-shaped payloads", () => {
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
  const printfulRecipient = getPrintRecipient(order);
  assert.ok(printfulRecipient);
  assert.equal(printfulRecipient.phone, FIXTURE_PHONE);

  const initialPayload = buildAlternateFulfillmentWebhookPayload(order, {
    printAssetUrl: "https://example.test/api/print/assets?id=asset-1",
    recipient: printfulRecipient,
  });
  const retryPayload = buildAlternateFulfillmentWebhookPayload(
    { ...order, attempts: 2, status: "failed", error: "webhook_failed" },
    {
      printAssetUrl: "https://example.test/api/print/assets?id=asset-1",
      cardPrintAssetUrl: "https://example.test/api/print/assets?id=card-1",
      recipient: printfulRecipient,
    },
  );

  for (const [label, payload] of [
    ["initial", initialPayload],
    ["retry", retryPayload],
  ]) {
    const serialized = JSON.stringify(payload);
    assert.equal(payload.customerPhone, undefined, `${label}: top-level customerPhone omitted`);
    assert.equal(payload.recipient?.phone, undefined, `${label}: recipient.phone omitted`);
    assert.equal(payload.shippingDetails?.phone, undefined, `${label}: shippingDetails.phone omitted`);
    assert.equal("hasCheckoutPhone" in payload, false, `${label}: no phone-presence flag on alternate webhook`);
    assert.doesNotMatch(serialized, /\+15555550199/, `${label}: no raw phone digits`);
    assert.doesNotMatch(serialized, /5555550199/, `${label}: no raw phone digits`);
    assert.doesNotMatch(serialized, /customerPhone/, `${label}: customerPhone key absent`);
    assert.equal(payload.printAssetUrl, "https://example.test/api/print/assets?id=asset-1");
    assert.equal(payload.recipient?.city, "Austin");
    assert.equal(payload.sessionId, order.sessionId);
  }

  // Canonical Printful recipient path still receives phone when present.
  assert.equal(getPrintRecipient(order)?.phone, FIXTURE_PHONE);
  // Stored-shaped record is not mutated by payload construction.
  assert.equal(order.customerPhone, FIXTURE_PHONE);

  assert.match(webhookRouteSource, /buildAlternateFulfillmentWebhookPayload/);
  assert.match(retryRouteSource, /buildAlternateFulfillmentWebhookPayload/);
  assert.doesNotMatch(
    webhookRouteSource,
    /JSON\.stringify\(\{\s*\.\.\.payload,\s*printAssetUrl,\s*recipient,\s*\}\)/,
  );
  assert.doesNotMatch(
    retryRouteSource,
    /JSON\.stringify\(\{\s*\.\.\.hydrated,\s*printAssetUrl,\s*recipient,\s*\}\)/,
  );
});
