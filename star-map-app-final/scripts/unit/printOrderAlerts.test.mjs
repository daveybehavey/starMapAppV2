import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPrintOrderAlertIdempotencyKey } from "./printOrderAlerts.harness.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "../..");
const alertsSource = fs.readFileSync(path.join(appRoot, "src/lib/printOrderAlerts.ts"), "utf8");

const order = { sessionId: "cs_test_4242", printfulOrderId: "8811" };

/* ================= #551 N4 — deterministic provider idempotency keys ================= */

test("#551 N4: the failure-alert key is deterministic for the same episode", () => {
  // Two concurrent deliveries of the same terminal event build the
  // identical key from the record identity alone, so the provider
  // collapses them into one delivered alert.
  const first = buildPrintOrderAlertIdempotencyKey(order, "failure");
  const twin = buildPrintOrderAlertIdempotencyKey({ ...order }, "failure");
  assert.equal(first, "print-order-alert:failure:cs_test_4242");
  assert.equal(twin, first);
});

test("#551 N4: keys differ across alert kinds and across sessions", () => {
  const failure = buildPrintOrderAlertIdempotencyKey(order, "failure");
  assert.notEqual(buildPrintOrderAlertIdempotencyKey(order, "approval"), failure);
  assert.notEqual(buildPrintOrderAlertIdempotencyKey(order, "hold"), failure);
  assert.notEqual(buildPrintOrderAlertIdempotencyKey(order, "review_pending"), failure);
  assert.notEqual(
    buildPrintOrderAlertIdempotencyKey({ sessionId: "cs_test_9999" }, "failure"),
    failure,
  );
});

test("#551 N4: the hold escalation keys separately from the first hold notice", () => {
  const firstNotice = buildPrintOrderAlertIdempotencyKey(order, "hold");
  const escalation = buildPrintOrderAlertIdempotencyKey(order, "hold", { escalated: true });
  assert.equal(firstNotice, "print-order-alert:hold:cs_test_4242");
  assert.equal(escalation, "print-order-alert:hold_escalation:cs_test_4242");
  assert.notEqual(escalation, firstNotice);
  // The escalated flag must not leak into other kinds' keys.
  assert.equal(
    buildPrintOrderAlertIdempotencyKey(order, "failure", { escalated: true }),
    "print-order-alert:failure:cs_test_4242",
  );
});

test("#551 N4: both provider sends carry the episode key (pinned in source)", () => {
  // Resend dedupes on the Idempotency-Key header.
  assert.match(
    alertsSource,
    /"Idempotency-Key": buildPrintOrderAlertIdempotencyKey\(order, kind, options\)/,
  );
  // SendGrid carries the identical key as a custom arg (it exposes no
  // send-side dedupe), so the episode is traceable end to end.
  assert.match(
    alertsSource,
    /print_order_alert_idempotency_key: buildPrintOrderAlertIdempotencyKey\(order, kind, options\)/,
  );
});
